/**
 * LLM Streaming Service — 调用 LLM API 并流式返回（支持工具调用 agentic loop）
 *
 * 参照 smart-code query.ts 的 agentic loop，简化版。
 * 每次用户消息触发多轮 LLM 调用：
 *   1. 发送 system + messages + tools 给 LLM
 *   2. 流式接收文本（实时输出给前端）+ 收集 tool_use
 *   3. 若有 tool_use：执行工具，将 tool_result 加入 messages，回到步骤 1
 *   4. 若无 tool_use（纯文本响应）：结束循环
 */

import * as os from 'os'
import { sessionService } from './sessionService'
import { ProviderService } from './providerService'
import { settingService } from './settingService'
import { getSystemPrompt } from '../constants/prompts'
import { getCompactPrompt, getCompactSystemPrompt, getCompactUserSummaryMessage } from '../constants/compactPrompt'
import {
  shouldAutoCompact,
  splitForPartialCompact,
  microcompactInPlace,
  isPromptTooLongError,
  KEEP_RECENT_MESSAGES,
  DEFAULT_CONTEXT_WINDOW_ANTHROPIC,
  DEFAULT_CONTEXT_WINDOW_OPENAI,
  MAX_REACTIVE_COMPACT_RETRIES,
} from './compactService'
import { listTasks } from './taskService'
import { getToolDefinitions, getTool } from '../tools'
import type { ToolContext, AskUserRequest } from '../tools'
import type { ApiFormat } from '../types/provider'

/**
 * Streaming-aware timeout: resets the timer each time reset() is called
 * (e.g., on every chunk received). Only aborts if NO data arrives within
 * `idleTimeoutMs`. A hard `maxTimeoutMs` caps the total duration.
 *
 * This prevents premature timeouts during extended thinking where the LLM
 * may not produce output for several minutes, while still detecting
 * genuinely stalled connections.
 */
function createStreamingTimeout(idleTimeoutMs: number = 120_000, maxTimeoutMs: number = 1_800_000) {
  const controller = new AbortController()
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let maxTimer: ReturnType<typeof setTimeout> | null = null
  let cleared = false

  const resetIdle = () => {
    if (cleared) return
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      console.error(`[LLM] Stream idle timeout (no data for ${idleTimeoutMs / 1000}s), aborting`)
      controller.abort()
    }, idleTimeoutMs)
  }

  maxTimer = setTimeout(() => {
    console.error(`[LLM] Stream max timeout (${maxTimeoutMs / 1000}s), aborting`)
    controller.abort()
  }, maxTimeoutMs)

  resetIdle()

  return {
    signal: controller.signal,
    reset: resetIdle,
    clear: () => {
      cleared = true
      if (idleTimer) clearTimeout(idleTimer)
      if (maxTimer) clearTimeout(maxTimer)
    },
  }
}

const providerService = new ProviderService()

export type StreamChunk =
  | { type: 'content_start' }
  | { type: 'content_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'status'; state: 'thinking' | 'streaming' | 'idle' }
  | { type: 'tool_call'; toolCallId: string; toolName: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; result: string; isError: boolean }
  | { type: 'ask_question'; requestId: string; questions: unknown[] }
  | { type: 'plan_proposal'; requestId: string; plan: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'message_complete' }
  | { type: 'error'; message: string }

/** 最大 agentic loop 轮数。参考设计（smart-code）用无限循环 + 自动压缩；
 *  本项目暂无上下文压缩，故设较高上限以容纳复杂多步任务，同时避免上下文溢出。 */
const MAX_TOOL_ROUNDS = 50

/** 输出被 max_tokens 截断时的恢复尝试次数（参考 smart-code MAX_OUTPUT_TOKENS_RECOVERY_LIMIT） */
const MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3
/** 思考循环时禁用 extended thinking 降级重试次数（加上首次 = 共 3 次尝试）。 */
const MAX_THINKING_STUCK_RETRIES = 2
const MAX_OUTPUT_TOKENS_RECOVERY_NUDGE =
  'Output token limit hit. Resume directly — no apology, no recap of what you were doing. ' +
  'Pick up mid-thought if that is where the cut happened. Break remaining work into smaller pieces.'

/**
 * 单轮对话内，agent 无工具调用结束但仍有 in_progress 任务时，注入续跑 nudge 的最大次数。
 * 超过后视为 agent 确实无法推进，结束本轮（避免无限循环）。
 */
const MAX_TASK_CONTINUE_NUDGES = 3

/**
 * 连续相同工具调用（相同 name + 相同 input）的最大次数。
 * 超过则判定为陷入循环，中断执行以避免反复输出同样信息。
 */
const MAX_CONSECUTIVE_IDENTICAL_TOOLS = 3
const TASK_CONTINUE_NUDGE = (subject: string, status: string) =>
  status === 'pending'
    ? `立即开始执行"${subject}"：先用 TaskUpdate 标记为 in_progress，然后调用所需工具完成它。` +
      `**不要只输出分析文字而不调用工具**——必须通过调用 Read/Bash/Grep/Edit 等工具实际推进任务。`
    : `立即继续执行"${subject}"。首先调用 TaskList 查看当前所有任务，` +
        `基于已有任务直接推进。**严禁重复创建任何已存在的任务**——` +
        `直接对已有任务调用 TaskUpdate 修改状态后继续执行。不要只回复文字说明。`

/** 查询当前会话中未完成的任务（in_progress 或 pending，用于循环内续跑）。 */
async function tryGetUnfinishedTask(
  sessionId: string,
): Promise<{ subject: string; status: string } | null> {
  try {
    const tasks = await listTasks(sessionId)
    const t = tasks.find((x) => x.status === 'in_progress') ?? tasks.find((x) => x.status === 'pending')
    return t ? { subject: t.subject, status: t.status } : null
  } catch {
    return null
  }
}

/** 工具调用信息 */
interface ToolUse {
  id: string
  name: string
  input: Record<string, unknown>
}

/** 一轮 LLM 调用的结果 */
interface LLMResponse {
  /** 文本内容 */
  text: string
  /** 工具调用列表 */
  toolUses: ToolUse[]
  /** 停止原因 */
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop' | 'length' | 'other'
  /** 输入 token 数（上下文使用量） */
  inputTokens: number
  /** 输出 token 数 */
  outputTokens: number
  /** Thinking blocks (with signatures) for conversation history */
  thinkingBlocks: Array<{ thinking: string; signature: string }>
  /**
   * 本次调用是否因思考循环/超时而中断。
   * 外层 loop 检测到此标志后可降级思考预算重试。
   */
  thinkingStuck?: boolean
}

// ─── Anthropic 消息格式 ──────────────────────────────────────

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'thinking'; thinking: string; signature: string }

type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

// ─── OpenAI 消息格式 ─────────────────────────────────────────

type OpenAIToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

// ─── 主入口 ──────────────────────────────────────────────────

/**
 * 调用 LLM API 并流式返回结果（支持工具调用循环）。
 */
export async function streamChat(
  sessionId: string,
  userContent: string,
  onChunk: (chunk: StreamChunk) => void,
  isCancelled?: () => boolean,
  askUser?: (request: AskUserRequest) => Promise<string>,
): Promise<void> {
  console.log(`[LLM] streamChat start: sessionId=${sessionId}, content="${userContent.slice(0, 50)}..."`)

  // Get active provider
  const { providers, activeId } = await providerService.listProviders()
  if (!activeId) {
    onChunk({ type: 'error', message: '没有活跃的服务商，请先在设置中配置并激活一个服务商' })
    return
  }

  const provider = providers.find((p) => p.id === activeId)
  if (!provider) {
    onChunk({ type: 'error', message: '找不到活跃的服务商配置' })
    return
  }

  // Get session workDir for tool execution
  let workDir = ''
  try {
    const session = await sessionService.getSession(sessionId)
    workDir = session.workDir || ''
  } catch {
    // Session might not have workDir
  }
  if (!workDir) workDir = os.homedir()

  const format: ApiFormat = provider.apiFormat ?? 'anthropic'
  const baseUrl = provider.baseUrl.replace(/\/+$/, '')
  const model = provider.models.main
  const apiKey = provider.apiKey

  // Get locale from settings for language preference in system prompt
  let locale: 'zh' | 'en' = 'zh'
  try {
    const settings = await settingService.getGeneralSettings()
    locale = settings.locale
  } catch {
    // Settings not available, use default
  }

  // Build system prompt (async: includes git context, SPACEAI.md, language, etc.)
  const systemPrompt = await getSystemPrompt(workDir, model, locale)

  // Build tool definitions
  const toolDefs = getToolDefinitions()

  // Build initial messages from history
  const history = await sessionService.getMessages(sessionId)
  // The last message is the current user message (already saved by conversationService)
  // Use all messages except we'll let the loop handle it

  const toolContext: ToolContext = { workDir, sessionId, askUser }

  onChunk({ type: 'status', state: 'thinking' })
  onChunk({ type: 'content_start' })

  let fullText = ''
  let thinking = ''
  let toolCalls: Array<{ id: string; toolName: string; input: Record<string, unknown>; result?: string; isError?: boolean }> | undefined
  const cancelCheck = isCancelled || (() => false)

  try {
    if (format === 'anthropic') {
      const result = await runAnthropicLoop(
        baseUrl, apiKey, model, systemPrompt, toolDefs, history,
        toolContext, onChunk, cancelCheck,
      )
      fullText = result.text
      thinking = result.thinking
      toolCalls = result.toolCalls
    } else {
      fullText = await runOpenAILoop(
        baseUrl, apiKey, model, systemPrompt, toolDefs, history,
        toolContext, onChunk, cancelCheck,
      )
    }

    onChunk({ type: 'status', state: 'idle' })
    onChunk({ type: 'message_complete' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[LLM] streamChat error: ${message}`)
    onChunk({ type: 'error', message })
    onChunk({ type: 'status', state: 'idle' })
  }

  // Save assistant response (text + thinking content + tool calls)
  if (fullText || thinking || (toolCalls && toolCalls.length > 0)) {
    try {
      await sessionService.addMessage(sessionId, 'assistant', fullText, thinking, toolCalls)
    } catch (err) {
      console.error(`[LLM] Failed to save assistant message: ${err}`)
    }
  }
}

// ─── 上下文压缩：调用 LLM 生成对话摘要 ──────────────────────

/**
 * 调用 Anthropic API（非流式）生成对话压缩摘要。
 * - 剥离 thinking 块（避免签名校验问题并减少 token）
 * - 不启用 thinking / 不带 tools（纯文本摘要）
 * - max_tokens 限制为摘要预算
 */
async function callAnthropicForCompact(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: AnthropicMessage[],
): Promise<string> {
  // Strip thinking blocks — summary only needs visible text + tool calls.
  const stripped: AnthropicMessage[] = messages.map((m) => {
    if (!Array.isArray(m.content)) return m
    const filtered = m.content.filter((b) => b.type !== 'thinking')
    return { ...m, content: filtered.length > 0 ? filtered : [{ type: 'text' as const, text: '' }] }
  })
  stripped.push({ role: 'user', content: getCompactPrompt() })

  const url = `${baseUrl}/v1/messages`
  const body = {
    model,
    max_tokens: 16000,
    system: getCompactSystemPrompt(),
    messages: stripped,
    stream: false,
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new Error(`Compact API ${resp.status}: ${t.slice(0, 300)}`)
  }
  const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }> }
  let text = ''
  for (const block of data.content ?? []) {
    if (block.type === 'text' && block.text) text += block.text
  }
  return text
}

/**
 * 调用 OpenAI 兼容 API（非流式）生成对话压缩摘要。
 */
async function callOpenAIForCompact(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: OpenAIMessage[],
): Promise<string> {
  // 用压缩专用 system prompt 替换原 system 消息，避免 agent 工具指令干扰摘要。
  const nonSystem = messages.filter((m) => m.role !== 'system')
  const withPrompt: OpenAIMessage[] = [
    { role: 'system', content: getCompactSystemPrompt() },
    ...nonSystem,
    { role: 'user', content: getCompactPrompt() },
  ]
  const url = `${baseUrl}/chat/completions`
  const body = { model, max_tokens: 16000, messages: withPrompt, stream: false }
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new Error(`Compact API ${resp.status}: ${t.slice(0, 300)}`)
  }
  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content ?? ''
}

// ─── 压缩编排：partial / micro / reactive ─────────────────────

type GenericMessage = { role: string; content: unknown }

/**
 * 执行 partial LLM 压缩：仅摘要旧消息，保留近期 KEEP_RECENT_MESSAGES 条原样。
 * 原地重建 messages = [可选 system, 摘要user消息, ...近期消息]。
 * @returns 是否成功压缩
 */
async function llmPartialCompact(
  messages: GenericMessage[],
  callCompact: (toSummarize: GenericMessage[]) => Promise<string>,
  systemPromptToPreserve?: string,
): Promise<boolean> {
  const split = splitForPartialCompact(messages, KEEP_RECENT_MESSAGES)
  if (split.toSummarize.length === 0) return false
  try {
    const summary = await callCompact(split.toSummarize)
    if (!summary || !summary.trim()) return false
    messages.length = 0
    if (systemPromptToPreserve) {
      messages.push({ role: 'system', content: systemPromptToPreserve } as never)
    }
    messages.push({ role: 'user', content: getCompactUserSummaryMessage(summary) } as never)
    for (const m of split.toKeep) messages.push(m as never)
    return true
  } catch {
    return false
  }
}

/**
 * 主动压缩（每轮开始时检测）：先 microcompact（无 LLM），仍超阈值再做 partial LLM 压缩。
 */
async function runAutoCompact(
  messages: GenericMessage[],
  contextWindow: number,
  callCompact: (toSummarize: GenericMessage[]) => Promise<string>,
  onChunk: (c: StreamChunk) => void,
  systemPromptToPreserve?: string,
): Promise<void> {
  if (!shouldAutoCompact(messages, contextWindow)) return
  // 1) microcompact：截断旧工具结果（无 API 调用）
  const truncated = microcompactInPlace(messages)
  if (!shouldAutoCompact(messages, contextWindow)) {
    if (truncated > 0) {
      onChunk({ type: 'content_delta', text: '\n\n[已清理旧工具输出以释放上下文空间。]\n\n' })
    }
    return
  }
  // 2) partial LLM 压缩：摘要旧消息，保留近期消息
  const compacted = await llmPartialCompact(messages, callCompact, systemPromptToPreserve)
  if (compacted) {
    onChunk({ type: 'content_delta', text: '\n\n[上下文已达上限，已自动压缩历史对话并继续执行任务。]\n\n' })
  }
}

/**
 * 被动压缩（prompt-too-long 错误时）：强制 microcompact + partial LLM 压缩后重试。
 * @returns 是否成功压缩（成功则可重试 LLM 调用）
 */
async function forceReactiveCompact(
  messages: GenericMessage[],
  callCompact: (toSummarize: GenericMessage[]) => Promise<string>,
  onChunk: (c: StreamChunk) => void,
  systemPromptToPreserve?: string,
): Promise<boolean> {
  onChunk({ type: 'content_delta', text: '\n\n[上下文超限，正在压缩历史对话后重试…]\n\n' })
  microcompactInPlace(messages)
  return llmPartialCompact(messages, callCompact, systemPromptToPreserve)
}

// ─── Anthropic agentic loop ──────────────────────────────────

async function runAnthropicLoop(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  toolDefs: ReturnType<typeof getToolDefinitions>,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  toolContext: ToolContext,
  onChunk: (chunk: StreamChunk) => void,
  isCancelled: () => boolean,
): Promise<{ text: string; thinking: string; toolCalls: Array<{ id: string; toolName: string; input: Record<string, unknown>; result?: string; isError?: boolean }> }> {
  // Build messages: history (as simple strings) + current user message
  const messages: AnthropicMessage[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  let fullText = ''
  let accumulatedThinking = ''
  const accumulatedToolCalls: Array<{ id: string; toolName: string; input: Record<string, unknown>; result?: string; isError?: boolean }> = []
  let maxOutputTokensRecoveryCount = 0
  let taskContinueCount = 0
  let lastToolSig: string | null = null
  let consecutiveRepeat = 0
  let loopDetected = false
  let completed = false

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (isCancelled()) break

    onChunk({ type: 'status', state: 'thinking' })

    // 上下文压缩：当消息接近上下文窗口时，先压缩历史再继续（参考 smart-code autocompact）
    await runAutoCompact(
      messages,
      DEFAULT_CONTEXT_WINDOW_ANTHROPIC,
      (ms) => callAnthropicForCompact(baseUrl, apiKey, model, ms as AnthropicMessage[]),
      onChunk,
    )

    // 调用 LLM；若遇到 prompt-too-long 错误，被动压缩后重试（reactive compact）
    let response: Awaited<ReturnType<typeof callAnthropic>>
    {
      let reactiveRetries = 0
      let thinkingStuckRetries = 0
      let thinkingBudgetForThisCall: number | undefined
      while (true) {
        try {
          response = await callAnthropic(
            baseUrl, apiKey, model, systemPrompt, messages, toolDefs, onChunk, isCancelled,
            thinkingBudgetForThisCall,
          )
          // 思考循环检测 -> 降级思考预算重试（最多 2 次 thinking 特定重试）
          if (response.thinkingStuck && thinkingStuckRetries < MAX_THINKING_STUCK_RETRIES) {
            thinkingStuckRetries++
            console.log(`[LLM] thinking stuck #${thinkingStuckRetries}, retrying with thinking disabled`)
            thinkingBudgetForThisCall = 0 // 禁用 extended thinking 后重试
            continue
          }
          break
        } catch (err) {
          if (isPromptTooLongError(err) && reactiveRetries < MAX_REACTIVE_COMPACT_RETRIES) {
            reactiveRetries++
            const compacted = await forceReactiveCompact(
              messages,
              (ms) => callAnthropicForCompact(baseUrl, apiKey, model, ms as AnthropicMessage[]),
              onChunk,
            )
            if (!compacted) throw err
            continue
          }
          throw err
        }
      }
    }

    // 思考循环重试 3 次仍失败 → 通知用户任务执行失败，跳出 agentic loop
    if (response.thinkingStuck) {
      const notice = `[任务执行失败：模型持续陷入思考循环（已尝试 ${MAX_REACTIVE_COMPACT_RETRIES + 1} 次降级重试），` +
        `无法产出有效结果。请简化任务描述或换一种方式提问。]`
      fullText += notice
      // 不要重复叠加 round cap 提示
      completed = true
      onChunk({ type: 'content_delta', text: '\n\n' + notice + '\n\n' })
      break
    }

    // Send usage info to frontend
    if (response.inputTokens > 0 || response.outputTokens > 0) {
      onChunk({ type: 'usage', inputTokens: response.inputTokens, outputTokens: response.outputTokens })
    }

    // Accumulate text
    if (response.text) {
      fullText += response.text
    }

    // Accumulate thinking content from all rounds
    for (const tb of response.thinkingBlocks) {
      if (tb.thinking) {
        accumulatedThinking += (accumulatedThinking ? '\n' : '') + tb.thinking
      }
    }

    // [诊断] 记录每轮的工具调用与停止原因，定位「nudge 后不继续」问题
    console.log(
      `[LLM] round=${round} tools=[${response.toolUses.map((t) => t.name).join(',')}] ` +
        `stop=${response.stopReason} textLen=${response.text.length} msgCount=${messages.length}`,
    )

    // If no tool calls, we're done. We intentionally do NOT gate on
    // stopReason === 'tool_use': some API proxies don't relay the standard
    // stop_reason (they send end_turn/stop or omit it), and gating on it
    // would discard tool calls the model actually emitted — causing the
    // agent to stop right after saying "let me read the code" without ever
    // calling the tool. The presence of tool_use blocks is the ground truth.
    //
    // max_output_tokens recovery: output was truncated mid-generation with no
    // complete tool calls. Nudge the model to resume instead of stopping
    // midway (mirrors smart-code's MAX_OUTPUT_TOKENS_RECOVERY_LIMIT).
    if (
      response.stopReason === 'max_tokens' &&
      response.toolUses.length === 0 &&
      maxOutputTokensRecoveryCount < MAX_OUTPUT_TOKENS_RECOVERY_LIMIT
    ) {
      if (response.text) {
        messages.push({ role: 'assistant', content: response.text })
      }
      messages.push({ role: 'user', content: MAX_OUTPUT_TOKENS_RECOVERY_NUDGE })
      maxOutputTokensRecoveryCount++
      continue
    }

    if (response.toolUses.length === 0) {
      // Agent ended without tool calls. If there's still an unfinished task
      // (in_progress or pending—the agent may have analyzed but not started),
      // nudge to continue WITHIN this turn (more reliable than a separate
      // frontend-initiated turn — no WS round-trip / polling lag).
      const unfinished = await tryGetUnfinishedTask(toolContext.sessionId)
      if (unfinished && taskContinueCount < MAX_TASK_CONTINUE_NUDGES) {
        taskContinueCount++
        console.log(`[LLM] task-continue nudge #${taskContinueCount}: "${unfinished.subject}" (${unfinished.status})`)
        if (response.text) messages.push({ role: 'assistant', content: response.text })
        messages.push({ role: 'user', content: TASK_CONTINUE_NUDGE(unfinished.subject, unfinished.status) })
        continue
      }
      completed = true
      break
    }

    // Add assistant message (with tool_use) to conversation
    const assistantContent: AnthropicContentBlock[] = []
    // Include thinking blocks (required by Anthropic API for extended thinking)
    for (const tb of response.thinkingBlocks) {
      assistantContent.push({ type: 'thinking', thinking: tb.thinking, signature: tb.signature })
    }
    if (response.text) {
      assistantContent.push({ type: 'text', text: response.text })
    }
    for (const tu of response.toolUses) {
      assistantContent.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input })
    }
    messages.push({ role: 'assistant', content: assistantContent })

    // Execute tools and add results
    const toolResults: AnthropicContentBlock[] = []
    for (const tu of response.toolUses) {
      if (isCancelled()) break
      // 检测连续相同的工具调用（相同 name + 相同 input），避免陷入无限循环反复输出同样信息
      const sig = tu.name + ':' + JSON.stringify(tu.input)
      if (sig === lastToolSig) {
        consecutiveRepeat++
      } else {
        consecutiveRepeat = 1
        lastToolSig = sig
      }
      if (consecutiveRepeat >= MAX_CONSECUTIVE_IDENTICAL_TOOLS) {
        loopDetected = true
        break
      }
      // Notify frontend: tool call started
      onChunk({ type: 'tool_call', toolCallId: tu.id, toolName: tu.name, input: tu.input })

      const result = await executeTool(tu, toolContext)
      // Notify frontend: tool result
      onChunk({ type: 'tool_result', toolCallId: tu.id, result: result.content, isError: result.isError })
      // Accumulate tool call data for persistence
      accumulatedToolCalls.push({
        id: tu.id,
        toolName: tu.name,
        input: tu.input,
        result: result.content,
        isError: result.isError,
      })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: result.content,
        is_error: result.isError,
      })

      // Inject newMessages (e.g. skill content) into conversation history
      // so the LLM sees them as user messages and continues naturally.
      if (result.newMessages && result.newMessages.length > 0) {
        for (const nm of result.newMessages) {
          messages.push({ role: nm.role as 'user', content: nm.content })
        }
      }
    }
    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults })
    }

    // 连续相同工具调用超阈值 —— 中断以避免无限循环
    if (loopDetected) {
      const notice = `\n\n[检测到重复的工具调用（连续 ${MAX_CONSECUTIVE_IDENTICAL_TOOLS} 次相同操作），已停止执行以避免无限循环。请检查任务或调整描述后重试。]`
      fullText += notice
      onChunk({ type: 'content_delta', text: notice })
      break
    }
  }

  // Hit the round cap without finishing — surface a clear notice so the user
  // knows the task was paused (not silently dropped mid-way).
  if (!completed && !loopDetected && !isCancelled()) {
    const notice = `\n\n[已达到单轮最大工具调用次数（${MAX_TOOL_ROUNDS}），任务暂停。如需继续，请回复"继续"。]`
    fullText += notice
    onChunk({ type: 'content_delta', text: notice })
  }

  return { text: fullText, thinking: accumulatedThinking, toolCalls: accumulatedToolCalls }
}

/** Single Anthropic API call with streaming */
async function callAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: AnthropicMessage[],
  toolDefs: ReturnType<typeof getToolDefinitions>,
  onChunk: (chunk: StreamChunk) => void,
  /* 用户在「停止」按钮点击时设置的外部取消信号；检查后立即中断读取 */
  isCancelled?: () => boolean,
  /**
   * 思考预算（token）。设为 0 可禁用 extended thinking，用于思考循环降级重试。
   * 默认 32000。
   */
  thinkingBudget?: number,
): Promise<LLMResponse> {
  const url = `${baseUrl}/v1/messages`
  const body: Record<string, unknown> = {
    model,
    max_tokens: 128000,
    system: systemPrompt,
    messages,
    stream: true,
    // Enable extended thinking for complex code generation
    thinking: { type: 'enabled', budget_tokens: thinkingBudget ?? 32000 },
  }
  if (toolDefs.length > 0) {
    body.tools = toolDefs
    body.tool_choice = { type: 'auto' }
  }

  const streamTimeout = createStreamingTimeout()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: streamTimeout.signal,
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Anthropic API ${response.status}: ${errText.slice(0, 300)}`)
  }

  if (!response.body) throw new Error('No response body')

  onChunk({ type: 'status', state: 'streaming' })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  // Collect content blocks by index
  const blocks = new Map<number, {
    type: 'text' | 'tool_use' | 'thinking'
    text: string
    toolId: string
    toolName: string
    inputJson: string
    thinking: string
    signature: string
  }>()

  let stopReason: LLMResponse['stopReason'] = 'other'
  let inputTokens = 0
  let outputTokens = 0
  const thinkingBlocks: Array<{ thinking: string; signature: string }> = []
  let thinkingStuck = false
  /** 纯思考（无文本/工具产出）的起始时间戳，用于超时检测 */
  let thinkingStartTime = 0
  const MAX_THINKING_MS = 300_000 // 5 分钟纯思考上限

  while (true) {
    const { done, value } = await reader.read()
    if (done || thinkingStuck || isCancelled?.()) break

    streamTimeout.reset()

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue

      const data = trimmed.slice(6)
      try {
        const event = JSON.parse(data)

        if (event.type === 'content_block_start') {
          const idx = event.index
          const block = event.content_block
          if (block.type === 'text') {
            blocks.set(idx, { type: 'text', text: '', toolId: '', toolName: '', inputJson: '', thinking: '', signature: '' })
          } else if (block.type === 'tool_use') {
            blocks.set(idx, {
              type: 'tool_use',
              text: '',
              toolId: block.id || '',
              toolName: block.name || '',
              inputJson: '',
              thinking: '',
              signature: '',
            })
            // 思考结束—模型开始调用工具，重置思考超时计时器
            thinkingStartTime = 0
          } else if (block.type === 'thinking') {
            blocks.set(idx, { type: 'thinking', text: '', toolId: '', toolName: '', inputJson: '', thinking: '', signature: '' })
            // 记录思考开始时间，用于超时检测
            if (thinkingStartTime === 0) thinkingStartTime = Date.now()
          }
        } else if (event.type === 'content_block_delta') {
          const idx = event.index
          const delta = event.delta
          const block = blocks.get(idx)
          if (!block) continue

          if (delta.type === 'text_delta' && delta.text) {
            block.text += delta.text
            fullText += delta.text
            onChunk({ type: 'content_delta', text: delta.text })
            // 思考结束—模型开始输出文本,重置思考超时计时器
            thinkingStartTime = 0
          } else if (delta.type === 'input_json_delta' && delta.partial_json) {
            block.inputJson += delta.partial_json
          } else if (delta.type === 'thinking_delta' && delta.thinking) {
            // Forward the raw delta to the frontend (the client dedups for display).
            onChunk({ type: 'thinking_delta', text: delta.thinking })
            // Dedup the accumulated thinking we persist: some API proxies resend
            // the accumulated text instead of incremental deltas, which would
            // otherwise double the stored thinking on every event.
            const t = delta.thinking
            const prev = block.thinking
            if (prev.length === 0) {
              block.thinking = t
            } else if (t.length >= prev.length && t.startsWith(prev)) {
              // delta contains everything we have (growing or identical resend) → replace
              block.thinking = t
            } else if (t.length >= 16 && prev.length > t.length && prev.startsWith(t)) {
              // delta is a large prefix of what we have (old content resent) → skip
            } else if (prev.length > 200000) {
              // safety valve against runaway growth
            } else {
              block.thinking = prev + t
            }

            // 检测思考内容是否陷入循环：最后 N 字符与前面 N 字符相同 → 模型在重复思考同一内容
            const LOOP_CHECK = 80
            if (block.thinking.length > LOOP_CHECK * 4) {
              const tail = block.thinking.slice(-LOOP_CHECK)
              const prev = block.thinking.slice(-LOOP_CHECK * 2, -LOOP_CHECK)
              if (tail === prev) {
                thinkingStuck = true
                onChunk({ type: 'thinking_delta', text: '\n\n[思考出现重复循环，已自动中断。]\n\n' })
                block.thinking += '\n\n[思考出现重复循环，已自动中断。]'
                break // break the for (line) loop
              }
            }
          } else if (delta.type === 'signature_delta' && delta.signature) {
            block.signature += delta.signature
          }
        } else if (event.type === 'content_block_stop') {
          const idx = event.index
          const block = blocks.get(idx)
          if (block && block.type === 'thinking' && block.thinking) {
            thinkingBlocks.push({ thinking: block.thinking, signature: block.signature })
          }
        } else if (event.type === 'message_delta') {
          if (event.delta?.stop_reason) {
            const sr = event.delta.stop_reason
            if (sr === 'end_turn') stopReason = 'end_turn'
            else if (sr === 'tool_use') stopReason = 'tool_use'
            else if (sr === 'max_tokens') stopReason = 'max_tokens'
          }
          if (event.usage?.output_tokens) {
            outputTokens = event.usage.output_tokens
          }
        } else if (event.type === 'message_start' && event.message?.usage) {
          const u = event.message.usage
          // Anthropic 的 input_tokens 仅含「未缓存」部分；启用 prompt caching 后，
          // system 提示词与早期历史落在 cache_read_input_tokens /
          // cache_creation_input_tokens 中。三者相加才是完整上下文大小。
          inputTokens =
            (u.input_tokens || 0) +
            (u.cache_creation_input_tokens || 0) +
            (u.cache_read_input_tokens || 0)
          outputTokens = u.output_tokens || 0
        }
      } catch {
        // Skip malformed SSE lines
      }
    }
    // 思考循环检测到后立即跳出 while 循环，不再等待下一个 chunk
    // 超时检测：纯思考流式传输超过阈值 → 认定陷入循环
    if (thinkingStartTime > 0 && Date.now() - thinkingStartTime > MAX_THINKING_MS && !thinkingStuck) {
      thinkingStuck = true
      onChunk({ type: 'thinking_delta', text: `\n\n[思考超时（超过 5 分钟未产出结果），已自动中断。]\n\n` })
        // 给前面的 thinking 块追加提示
        for (const [, block] of blocks) {
          if (block.type === 'thinking' && block.thinking.length > 0) {
            block.thinking += `\n\n[思考超时（超过 5 分钟未产出结果），已自动中断。]`
        }
      }
    }
    if (thinkingStuck) break
  }

  // Parse tool uses from collected blocks
  const toolUses: ToolUse[] = []
  for (const [, block] of [...blocks.entries()].sort((a, b) => a[0] - b[0])) {
    if (block.type === 'tool_use') {
      let input: Record<string, unknown> = {}
      if (block.inputJson) {
        try {
          input = JSON.parse(block.inputJson)
        } catch {
          input = {}
        }
      }
      toolUses.push({ id: block.toolId, name: block.toolName, input })
    }
  }

  streamTimeout.clear()
  return { text: fullText, toolUses, stopReason, inputTokens, outputTokens, thinkingBlocks, thinkingStuck }
}

// ─── OpenAI agentic loop ─────────────────────────────────────

async function runOpenAILoop(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  toolDefs: ReturnType<typeof getToolDefinitions>,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  toolContext: ToolContext,
  onChunk: (chunk: StreamChunk) => void,
  isCancelled: () => boolean,
): Promise<string> {
  // Build messages: system + history (as simple strings)
  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  let fullText = ''
  let maxOutputTokensRecoveryCount = 0
  let taskContinueCount = 0
  let lastToolSig: string | null = null
  let consecutiveRepeat = 0
  let loopDetected = false
  let completed = false

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (isCancelled()) break

    onChunk({ type: 'status', state: 'thinking' })

    // 上下文压缩：当消息接近上下文窗口时，先压缩历史再继续（参考 smart-code autocompact）
    // OpenAI 格式 system 在 messages 内，需保留 systemPrompt
    await runAutoCompact(
      messages,
      DEFAULT_CONTEXT_WINDOW_OPENAI,
      (ms) => callOpenAIForCompact(baseUrl, apiKey, model, ms as OpenAIMessage[]),
      onChunk,
      systemPrompt,
    )

    // 调用 LLM；若遇到 prompt-too-long 错误，被动压缩后重试（reactive compact）
    let response: Awaited<ReturnType<typeof callOpenAI>>
    {
      let reactiveRetries = 0
      while (true) {
        try {
          response = await callOpenAI(
            baseUrl, apiKey, model, messages, toolDefs, onChunk, isCancelled,
          )
          break
        } catch (err) {
          if (isPromptTooLongError(err) && reactiveRetries < MAX_REACTIVE_COMPACT_RETRIES) {
            reactiveRetries++
            const compacted = await forceReactiveCompact(
              messages,
              (ms) => callOpenAIForCompact(baseUrl, apiKey, model, ms as OpenAIMessage[]),
              onChunk,
              systemPrompt,
            )
            if (!compacted) throw err
            continue
          }
          throw err
        }
      }
    }

    // Send usage info to frontend
    if (response.inputTokens > 0 || response.outputTokens > 0) {
      onChunk({ type: 'usage', inputTokens: response.inputTokens, outputTokens: response.outputTokens })
    }

    if (response.text) {
      fullText += response.text
    }

    // [诊断] 记录每轮工具调用与停止原因
    console.log(
      `[LLM/openai] round=${round} tools=[${response.toolUses.map((t) => t.name).join(',')}] ` +
        `stop=${response.stopReason} textLen=${response.text.length} msgCount=${messages.length}`,
    )

    // max_output_tokens recovery (see Anthropic loop for rationale).
    if (
      response.stopReason === 'max_tokens' &&
      response.toolUses.length === 0 &&
      maxOutputTokensRecoveryCount < MAX_OUTPUT_TOKENS_RECOVERY_LIMIT
    ) {
      if (response.text) {
        messages.push({ role: 'assistant', content: response.text })
      }
      messages.push({ role: 'user', content: MAX_OUTPUT_TOKENS_RECOVERY_NUDGE })
      maxOutputTokensRecoveryCount++
      continue
    }

    // If no tool calls, we're done. Don't gate on stopReason === 'tool_use'
    // (see Anthropic loop for rationale — proxies may not relay stop_reason).
    if (response.toolUses.length === 0) {
      // Agent ended without tool calls. If there's still an unfinished task
      // (in_progress or pending), nudge to continue within this turn.
      const unfinished = await tryGetUnfinishedTask(toolContext.sessionId)
      if (unfinished && taskContinueCount < MAX_TASK_CONTINUE_NUDGES) {
        taskContinueCount++
        console.log(`[LLM/openai] task-continue nudge #${taskContinueCount}: "${unfinished.subject}" (${unfinished.status})`)
        if (response.text) messages.push({ role: 'assistant', content: response.text })
        messages.push({ role: 'user', content: TASK_CONTINUE_NUDGE(unfinished.subject, unfinished.status) })
        continue
      }
      completed = true
      break
    }

    // Add assistant message (with tool_calls) to conversation
    const assistantMsg: OpenAIMessage = {
      role: 'assistant',
      content: response.text || null,
      tool_calls: response.toolUses.map((tu) => ({
        id: tu.id,
        type: 'function' as const,
        function: { name: tu.name, arguments: JSON.stringify(tu.input) },
      })),
    }
    messages.push(assistantMsg)

    // Add tool results
    for (const tu of response.toolUses) {
      if (isCancelled()) break
      // 检测连续相同的工具调用，避免无限循环
      const sig = tu.name + ':' + JSON.stringify(tu.input)
      if (sig === lastToolSig) {
        consecutiveRepeat++
      } else {
        consecutiveRepeat = 1
        lastToolSig = sig
      }
      if (consecutiveRepeat >= MAX_CONSECUTIVE_IDENTICAL_TOOLS) {
        loopDetected = true
        break
      }
      // Notify frontend: tool call started
      onChunk({ type: 'tool_call', toolCallId: tu.id, toolName: tu.name, input: tu.input })

      const result = await executeTool(tu, toolContext)
      // Notify frontend: tool result
      onChunk({ type: 'tool_result', toolCallId: tu.id, result: result.content, isError: result.isError })
      messages.push({
        role: 'tool',
        content: result.content,
        tool_call_id: tu.id,
      })
    }

    if (loopDetected) {
      const notice = `\n\n[检测到重复的工具调用（连续 ${MAX_CONSECUTIVE_IDENTICAL_TOOLS} 次相同操作），已停止执行以避免无限循环。请检查任务或调整描述后重试。]`
      fullText += notice
      onChunk({ type: 'content_delta', text: notice })
      break
    }
  }

  // Hit the round cap without finishing — surface a clear notice.
  if (!completed && !loopDetected && !isCancelled()) {
    const notice = `\n\n[已达到单轮最大工具调用次数（${MAX_TOOL_ROUNDS}），任务暂停。如需继续，请回复"继续"。]`
    fullText += notice
    onChunk({ type: 'content_delta', text: notice })
  }

  return fullText
}

/** Single OpenAI API call with streaming */
async function callOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: OpenAIMessage[],
  toolDefs: ReturnType<typeof getToolDefinitions>,
  onChunk: (chunk: StreamChunk) => void,
  isCancelled?: () => boolean,
): Promise<LLMResponse> {
  const url = `${baseUrl}/chat/completions`
  const body: Record<string, unknown> = {
    model,
    max_tokens: 16000,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  }
  if (toolDefs.length > 0) {
    body.tools = toolDefs.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }))
    body.tool_choice = 'auto'
  }

  const streamTimeout = createStreamingTimeout()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: streamTimeout.signal,
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`OpenAI API ${response.status}: ${errText.slice(0, 300)}`)
  }

  if (!response.body) throw new Error('No response body')

  onChunk({ type: 'status', state: 'streaming' })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  // Collect tool calls by index
  const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>()
  let finishReason = ''
  let inputTokens = 0
  let outputTokens = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done || isCancelled?.()) break

    streamTimeout.reset()

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue

      const data = trimmed.slice(6)
      if (data === '[DONE]') continue

      try {
        const event = JSON.parse(data)
        const choice = event.choices?.[0]
        if (!choice) continue

        const delta = choice.delta

        // Text content
        if (delta?.content) {
          fullText += delta.content
          onChunk({ type: 'content_delta', text: delta.content })
        }

        // Tool calls
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index
            const existing = toolCallMap.get(idx) || { id: '', name: '', arguments: '' }
            if (tc.id) existing.id = tc.id
            if (tc.function?.name) existing.name = tc.function.name
            if (tc.function?.arguments) existing.arguments += tc.function.arguments
            toolCallMap.set(idx, existing)
          }
        }

        // Finish reason
        if (choice.finish_reason) {
          finishReason = choice.finish_reason
        }

        // Usage (in the last chunk when stream_options.include_usage is true)
        if (event.usage) {
          inputTokens = event.usage.prompt_tokens || 0
          outputTokens = event.usage.completion_tokens || 0
        }
      } catch {
        // Skip malformed SSE lines
      }
    }
  }

  // Parse tool uses
  const toolUses: ToolUse[] = []
  for (const [, tc] of [...toolCallMap.entries()].sort((a, b) => a[0] - b[0])) {
    let input: Record<string, unknown> = {}
    if (tc.arguments) {
      try {
        input = JSON.parse(tc.arguments)
      } catch {
        input = {}
      }
    }
    toolUses.push({ id: tc.id || `call_${Date.now()}_${Math.random()}`, name: tc.name, input })
  }

  let stopReason: LLMResponse['stopReason'] = 'other'
  if (finishReason === 'stop') stopReason = 'end_turn'
  else if (finishReason === 'tool_calls') stopReason = 'tool_use'
  else if (finishReason === 'length') stopReason = 'length'

  streamTimeout.clear()
  return { text: fullText, toolUses, stopReason, inputTokens, outputTokens, thinkingBlocks: [] }
}

// ─── 工具执行 ────────────────────────────────────────────────

async function executeTool(
  toolUse: ToolUse,
  context: ToolContext,
): Promise<{ content: string; isError: boolean; newMessages?: Array<{ role: 'user'; content: string }> }> {
  const tool = getTool(toolUse.name)
  if (!tool) {
    return { content: `Error: unknown tool "${toolUse.name}"`, isError: true }
  }

  try {
    const result = await tool.execute(toolUse.input, context)
    return { content: result.content, isError: result.isError === true, newMessages: result.newMessages }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[Tool] ${toolUse.name} error: ${msg}`)
    return { content: `Error executing tool ${toolUse.name}: ${msg}`, isError: true }
  }
}
