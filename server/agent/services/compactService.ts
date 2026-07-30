/**
 * 上下文压缩服务：token 估算 + 触发阈值判断。
 * 参考 smart-code src/services/compact/autoCompact.ts 与 tokenEstimation.ts。
 *
 * token 估算采用粗略的 chars/4（与 smart-code roughTokenCountEstimation 一致），
 * 不依赖 tokenizer，足够用于触发判断。
 */

type AnyMessage = { role: string; content: unknown }

/** 默认上下文窗口（token）。Anthropic Claude 系列通常 200K。 */
export const DEFAULT_CONTEXT_WINDOW_ANTHROPIC = 200000
/** OpenAI 兼容模型默认窗口。 */
export const DEFAULT_CONTEXT_WINDOW_OPENAI = 128000

/** 预留给压缩摘要输出的 token（参考 smart-code MAX_OUTPUT_TOKENS_FOR_SUMMARY） */
const RESERVED_SUMMARY_TOKENS = 20000
/** 压缩触发缓冲（参考 smart-code AUTOCOMPACT_BUFFER_TOKENS） */
const AUTOCOMPACT_BUFFER_TOKENS = 13000

/** partial compact：保留近期 N 条消息不压缩（保留即时上下文） */
export const KEEP_RECENT_MESSAGES = 6
/** microcompact：保留近期 N 条工具结果不截断 */
export const KEEP_RECENT_TOOL_RESULTS = 3
/** reactive compact：上下文超限时的最大压缩重试次数 */
export const MAX_REACTIVE_COMPACT_RETRIES = 2

function estimateTokensForContent(content: unknown): number {
  if (!content) return 0
  if (typeof content === 'string') return Math.ceil(content.length / 4)
  if (Array.isArray(content)) {
    let total = 0
    for (const block of content as unknown[]) {
      total += estimateTokensForBlock(block)
    }
    return total
  }
  return 0
}

function estimateTokensForBlock(block: unknown): number {
  if (typeof block === 'string') return Math.ceil(block.length / 4)
  if (!block || typeof block !== 'object') return 0
  const b = block as Record<string, unknown>
  switch (b.type) {
    case 'text':
      return Math.ceil(String(b.text ?? '').length / 4)
    case 'thinking':
      // thinking 不计入发送上下文（压缩时会剥离），但估算时仍计入以反映真实占用
      return Math.ceil(String(b.thinking ?? '').length / 4)
    case 'tool_use':
      return Math.ceil(JSON.stringify(b.input ?? {}).length / 4) + 20
    case 'tool_result':
      return estimateTokensForContent(b.content) + 20
    default:
      return Math.ceil(JSON.stringify(b).length / 4)
  }
}

/**
 * 粗略估算消息列表的 token 总数。
 */
export function estimateTokensForMessages(messages: readonly AnyMessage[]): number {
  let total = 0
  for (const m of messages) {
    total += estimateTokensForContent(m.content) + 4 // per-message overhead
  }
  return total
}

/**
 * 压缩触发阈值 = 有效窗口 - 缓冲。
 * 有效窗口 = 上下文窗口 - 预留摘要 token。
 */
export function getAutoCompactThreshold(contextWindow: number): number {
  const effectiveWindow = contextWindow - RESERVED_SUMMARY_TOKENS
  return effectiveWindow - AUTOCOMPACT_BUFFER_TOKENS
}

/**
 * 判断是否应当触发自动压缩。
 * @param messages 消息列表
 * @param contextWindow 模型上下文窗口大小（token）
 */
export function shouldAutoCompact(
  messages: readonly AnyMessage[],
  contextWindow: number,
): boolean {
  // 消息太少时不压缩（没有足够内容可摘要）
  if (messages.length < 4) return false
  const tokenCount = estimateTokensForMessages(messages)
  const threshold = getAutoCompactThreshold(contextWindow)
  return tokenCount >= threshold
}

// ─── partial compact：保留近期消息 ───────────────────────────

/** 判断消息是否为工具结果（Anthropic 的 tool_result block 或 OpenAI 的 tool 角色） */
function containsToolResult(m: AnyMessage): boolean {
  if (m.role === 'tool') return true
  if (Array.isArray(m.content)) {
    return (m.content as unknown[]).some((b) => {
      if (!b || typeof b !== 'object') return false
      return (b as Record<string, unknown>).type === 'tool_result'
    })
  }
  return false
}

/**
 * 将消息列表切分为「需摘要的旧消息」与「原样保留的近期消息」。
 * - 保留近期 keepRecent 条消息
 * - 调整切分点跳过孤立的 tool_result（其 tool_use 已被摘要走，保留会无效）
 * - 若可摘要部分太少则不切分（返回空 toSummarize）
 */
export function splitForPartialCompact(
  messages: readonly AnyMessage[],
  keepRecent: number,
): { toSummarize: AnyMessage[]; toKeep: AnyMessage[] } {
  const n = messages.length
  if (n <= keepRecent + 2) {
    return { toSummarize: [], toKeep: messages.slice() }
  }
  let keepStart = n - keepRecent
  // 向后移动切分点，跳过被保留段开头的孤立 tool_result
  while (keepStart < n && containsToolResult(messages[keepStart])) {
    keepStart++
  }
  if (keepStart >= n - 1) {
    return { toSummarize: [], toKeep: messages.slice() }
  }
  return {
    toSummarize: messages.slice(0, keepStart),
    toKeep: messages.slice(keepStart),
  }
}

// ─── microcompact：无 LLM 截断旧工具结果 ─────────────────────

/**
 * 原地截断旧工具结果内容（保留近期 KEEP_RECENT_TOOL_RESULTS 条），
 * 用占位符替换以释放上下文空间。不调用 LLM，开销极低。
 * @returns 被截断的消息条数
 */
export function microcompactInPlace(
  messages: AnyMessage[],
  keepRecentToolResults: number = KEEP_RECENT_TOOL_RESULTS,
): number {
  const toolResultIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (containsToolResult(messages[i])) toolResultIndices.push(i)
  }
  const cutoff = toolResultIndices.length - keepRecentToolResults
  if (cutoff <= 0) return 0
  const toTruncate = toolResultIndices.slice(0, cutoff)
  const placeholder = '[Tool output truncated to save context space]'
  for (const idx of toTruncate) {
    const m = messages[idx]
    if (m.role === 'tool') {
      m.content = placeholder
    } else if (Array.isArray(m.content)) {
      m.content = (m.content as unknown[]).map((b) => {
        if (b && typeof b === 'object' && (b as Record<string, unknown>).type === 'tool_result') {
          return { ...(b as object), content: placeholder }
        }
        return b
      })
    }
  }
  return toTruncate.length
}

// ─── reactive compact：prompt-too-long 错误检测 ──────────────

/**
 * 判断错误是否为「上下文/prompt 超长」类错误（用于触发被动压缩重试）。
 * 兼容 Anthropic（"prompt is too long"）与 OpenAI（"context_length_exceeded"）。
 */
export function isPromptTooLongError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /prompt is too long|context_length_exceeded|too long|maximum context|context length|exceeds the model|input length|input.*exceed|reduce the length/i.test(
    msg,
  )
}
