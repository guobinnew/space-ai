/**
 * Compact Service — 按天粒度的会话压缩。
 *
 * 触发条件：保留原有的 shouldAutoCompact（基于 chars/4 token 估算 + contextWindow 阈值）。
 * 压缩流程：
 *   1. 读取 manifest.compactedThroughDate（旧截止日，可能为 null）
 *   2. 取 compactedThroughDate 之后所有 jsonl 文件，按天升序排列
 *   3. 选定"待压缩截止日" = 这些天里除最后一天外的最大日（保留最近一天不压缩）
 *      （若只有一天则跳过——单日不压缩）
 *   4. 把 [旧 compactedThroughDate+1, 待压缩截止日] 范围的所有 entries 送给 LLM 生成新摘要
 *   5. 把新摘要追加到现有 memory.md（若已有旧摘要，按"旧摘要 + 新增内容 → 重新总结"流程合并）
 *   6. 更新 manifest.compactedThroughDate = 待压缩截止日
 *   7. 原始 jsonl 文件保留不删除
 *
 * 上下文拼装时（sessionService.getMessages）：
 *   先读 memory.md 作为开头 user summary，再读 compactedThroughDate 之后的所有 jsonl。
 *
 * 原来的 microcompact / partial / reactive 仍在 LLM 内存中保留（运行时压缩当前 messages 数组），
 * 与持久化的按天压缩互补：内存压缩是临时的，跨会话不保留；按天压缩写入 memory.md 是持久的。
 */

import type { GenericMessage, StreamChunk } from '../types/stream'
import { sessionService, type JsonlEntry } from './sessionService'
import {
  getCompactPrompt,
  getCompactSystemPrompt,
  formatCompactSummary,
} from '../constants/compactPrompt'

export const KEEP_RECENT_MESSAGES = 6
export const KEEP_RECENT_TOOL_RESULTS = 3
export const MAX_REACTIVE_COMPACT_RETRIES = 2
export const DEFAULT_CONTEXT_WINDOW_ANTHROPIC = 200_000
export const DEFAULT_CONTEXT_WINDOW_OPENAI = 128_000

/**
 * Detect "prompt too long" / "context length exceeded" errors from various
 * LLM providers (Anthropic / OpenAI compatible). Used to trigger reactive compact.
 */
export function isPromptTooLongError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /prompt is too long|context_length_exceeded|too long|maximum context|context length|exceeds the model|input length|input.*exceed|reduce the length/i.test(
    msg,
  )
}

export type GenericMessage = GenericMessage

export function shouldAutoCompact(messages: unknown[], contextWindow: number): boolean {
  if (messages.length < 4) return false
  const totalChars = messages.reduce((acc, m) => {
    const c = (m as { content?: unknown }).content
    if (typeof c === 'string') return acc + c.length
    if (Array.isArray(c)) {
      return acc + c.reduce((s: number, b) => {
        if (typeof b === 'string') return s + b.length
        if (b && typeof b === 'object') {
          const text = (b as { text?: string }).text
          if (text) return s + text.length
          const thinking = (b as { thinking?: string }).thinking
          if (thinking) return s + thinking.length
        }
        return s
      }, 0)
    }
    return acc
  }, 0)
  const estimatedTokens = Math.ceil(totalChars / 4)
  return estimatedTokens > contextWindow - 20000 - 13000
}

/**
 * Split messages into [to-summarize, to-keep] by keeping last KEEP_RECENT_MESSAGES.
 * 用于运行时内存压缩（不影响磁盘文件）。
 */
export function splitForPartialCompact<T>(messages: T[]): { toSummarize: T[]; toKeep: T[] } {
  if (messages.length <= KEEP_RECENT_MESSAGES) {
    return { toSummarize: [], toKeep: messages }
  }
  const cut = messages.length - KEEP_RECENT_MESSAGES
  return {
    toSummarize: messages.slice(0, cut),
    toKeep: messages.slice(cut),
  }
}

/**
 * microcompact: 在内存中把旧 tool_result（保留最近 KEEP_RECENT_TOOL_RESULTS 条）替换为占位符。
 * 不写盘，仅影响运行时 messages 数组。
 */
export function microcompactInPlace(messages: GenericMessage[]): number {
  let truncated = 0
  for (let i = messages.length - 1 - KEEP_RECENT_TOOL_RESULTS; i >= 0; i--) {
    const m = messages[i]!
    if (m.role === 'user') {
      const content = m.content as unknown
      if (Array.isArray(content)) {
        let hasToolResult = false
        const replaced = (content as Array<Record<string, unknown>>).map((b) => {
          if (b && b.type === 'tool_result') {
            hasToolResult = true
            return { ...b, content: '[tool output truncated to save context]' }
          }
          return b
        })
        if (hasToolResult) {
          messages[i] = { ...m, content: replaced as never } as GenericMessage
          truncated++
        }
      }
    }
  }
  return truncated
}

/**
 * 在内存中做 partial LLM 压缩：调用 callCompact 摘要旧消息，把摘要作为新 user 消息替换 toSummarize。
 */
export async function llmPartialCompact(
  messages: GenericMessage[],
  callCompact: (toSummarize: GenericMessage[]) => Promise<string>,
  systemPromptToPreserve?: string,
): Promise<boolean> {
  const split = splitForPartialCompact(messages)
  if (split.toSummarize.length === 0) return false
  try {
    const summary = await callCompact(split.toSummarize)
    const formatted = formatCompactSummary(summary)
    messages.length = 0
    if (systemPromptToPreserve) {
      messages.push({ role: 'system', content: systemPromptToPreserve } as never)
    }
    messages.push({
      role: 'user',
      content: '[earlier conversation has been compacted]\n\n' + formatted,
    } as never)
    for (const m of split.toKeep) messages.push(m as never)
    return true
  } catch {
    return false
  }
}

// ─── 按天持久化压缩 ─────────────────────────────────────────────

/**
 * 计算待压缩的截止日期。
 *
 * @param currentCompactedThrough 当前 manifest.compactedThroughDate（YYYY-MM-DD 或 null）
 * @param allDays 该会话所有可见（compactedThroughDate 之后）的日期，升序
 * @returns 新的截止日 YYYY-MM-DD，或 null（无可压缩范围）
 *
 * 策略：保留最新一天不压缩，把倒数第二天及之前的全部压缩。
 * 例如当前无压缩、有 2026-07-01..2026-08-01，返回 2026-07-31。
 * 若当前已压缩到 2026-07-15、之后有 07-16..08-01，返回 2026-07-31。
 * 只有 1 天时不压缩（返回 null）。
 */
export function pickCompactThroughDate(
  currentCompactedThrough: string | null,
  allDays: string[],
): string | null {
  const visible = currentCompactedThrough
    ? allDays.filter((d) => d > currentCompactedThrough)
    : allDays
  if (visible.length < 2) return null
  visible.sort()
  // 倒数第二天（保留最新一天）
  return visible[visible.length - 2]!
}

/**
 * 按天压缩：把 [旧 compactedThroughDate+1, 新截止日] 范围的消息交给 LLM 生成摘要，
 * 合并到 memory.md，并更新 manifest.compactedThroughDate。
 *
 * @param sessionId 会话 ID
 * @param callCompact LLM 调用函数（接收 messages 数组，返回摘要文本）
 * @param onChunk 用于通知前端压缩进度
 * @returns 是否真的执行了压缩
 */
export async function compactByDays(
  sessionId: string,
  callCompact: (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => Promise<string>,
  onChunk?: (c: StreamChunk) => void,
): Promise<boolean> {
  const manifest = await sessionService.getManifest(sessionId)
  if (!manifest) return false

  const days = await sessionService.listDays(sessionId)
  const newThrough = pickCompactThroughDate(manifest.compactedThroughDate, days)
  if (!newThrough) return false
  // 已压缩到同一日，避免重复
  if (manifest.compactedThroughDate === newThrough) return false

  // 收集需要压缩的所有 entries（从旧截止日之后到新截止日，含两端）
  const startDate = manifest.compactedThroughDate
  const daysInRange = days.filter((d) => {
    if (startDate && d <= startDate) return false
    return d <= newThrough
  })

  // 按天单独读取精确当天的 entries
  const rangeEntries: JsonlEntry[] = []
  for (const d of daysInRange) {
    const allAfterNull = await sessionService.getEntriesAfterDate(sessionId, null)
    const dayEntries = allAfterNull.filter(
      (e) => e.type !== 'session-meta' && dayEntryDate(e) === d,
    )
    rangeEntries.push(...dayEntries)
  }

  if (rangeEntries.length === 0) return false

  // 转换为简单 {role, content} 数组供 LLM 压缩
  const llmMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const e of rangeEntries) {
    if (e.type === 'user') {
      const text = (e.message.content as Array<{ type: string; text?: string }>)
        .filter((b) => b.type === 'text')
        .map((b) => b.text || '')
        .join('\n')
      if (text) llmMessages.push({ role: 'user', content: text })
    } else if (e.type === 'assistant') {
      const text = (e.message.content as Array<{ type: string; text?: string }>)
        .filter((b) => b.type === 'text')
        .map((b) => b.text || '')
        .join('\n')
      if (text) llmMessages.push({ role: 'assistant', content: text })
    }
  }

  if (llmMessages.length === 0) return false

  onChunk?.({
    type: 'content_delta',
    text: `\n\n[正在压缩 ${daysInRange[0]} 至 ${newThrough} 的历史对话到 memory.md…]\n\n`,
  })

  // 调用 LLM 生成新摘要
  let newSummary: string
  try {
    newSummary = await callCompact(llmMessages)
  } catch (err) {
    console.error('[compact] LLM call failed:', err)
    onChunk?.({ type: 'content_delta', text: '\n\n[压缩失败，继续使用原上下文。]\n\n' })
    return false
  }

  const formattedNew = formatCompactSummary(newSummary)

  // 与旧 memory.md 合并：若有旧摘要，把旧摘要 + 新增消息一起再总结
  const existingMemory = await sessionService.readMemory(sessionId)
  let finalMemory: string
  if (existingMemory && existingMemory.trim()) {
    // 把旧摘要作为前缀，让 LLM 再总结一次
    try {
      const mergedInput = [
        { role: 'user', content: `[此前已有的压缩摘要]\n\n${existingMemory}` },
        { role: 'user', content: `[新增的待压缩对话，已生成新摘要]\n\n${formattedNew}` },
      ]
      const merged = await callCompact(mergedInput)
      finalMemory = formatCompactSummary(merged)
    } catch {
      // 合并失败，直接拼接
      finalMemory = `${existingMemory}\n\n---\n\n[截至 ${newThrough} 的更新]\n\n${formattedNew}`
    }
  } else {
    finalMemory = `# 会话压缩摘要\n\n压缩截止：${newThrough}\n\n${formattedNew}`
  }

  // 写回 memory.md + 更新 manifest
  await sessionService.writeMemory(sessionId, finalMemory)
  await sessionService.updateManifest(sessionId, { compactedThroughDate: newThrough })

  onChunk?.({
    type: 'content_delta',
    text: `\n\n[已压缩 ${daysInRange[0]} 至 ${newThrough} 的历史到 memory.md（原始 jsonl 保留）。]\n\n`,
  })

  return true
}

/** 从 entry 提取本地日期 */
function dayEntryDate(e: JsonlEntry): string {
  const d = new Date(e.timestamp)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export { getCompactPrompt, getCompactSystemPrompt }
