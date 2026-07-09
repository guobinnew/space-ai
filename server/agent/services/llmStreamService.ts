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
import { getToolDefinitions, getTool } from '../tools'
import type { ToolContext, AskUserRequest } from '../tools'
import type { ApiFormat } from '../types/provider'

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

/** 最大 agentic loop 轮数（防止无限循环） */
const MAX_TOOL_ROUNDS = 15

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
  const cancelCheck = isCancelled || (() => false)

  try {
    if (format === 'anthropic') {
      const result = await runAnthropicLoop(
        baseUrl, apiKey, model, systemPrompt, toolDefs, history,
        toolContext, onChunk, cancelCheck,
      )
      fullText = result.text
      thinking = result.thinking
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

  // Save assistant response (text + thinking content)
  if (fullText) {
    try {
      await sessionService.addMessage(sessionId, 'assistant', fullText, thinking)
    } catch (err) {
      console.error(`[LLM] Failed to save assistant message: ${err}`)
    }
  }
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
): Promise<{ text: string; thinking: string }> {
  // Build messages: history (as simple strings) + current user message
  const messages: AnthropicMessage[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  let fullText = ''
  let accumulatedThinking = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (isCancelled()) break

    onChunk({ type: 'status', state: 'thinking' })

    const response = await callAnthropic(
      baseUrl, apiKey, model, systemPrompt, messages, toolDefs, onChunk,
    )

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

    // If no tool calls, we're done
    if (response.toolUses.length === 0 || response.stopReason !== 'tool_use') {
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
      // Notify frontend: tool call started
      onChunk({ type: 'tool_call', toolCallId: tu.id, toolName: tu.name, input: tu.input })
      const result = await executeTool(tu, toolContext)
      // Notify frontend: tool result
      onChunk({ type: 'tool_result', toolCallId: tu.id, result: result.content, isError: result.isError })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: result.content,
        is_error: result.isError,
      })
    }
    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults })
    }
  }

  return fullText
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
): Promise<LLMResponse> {
  const url = `${baseUrl}/v1/messages`
  const body: Record<string, unknown> = {
    model,
    max_tokens: 32000,
    system: systemPrompt,
    messages,
    stream: true,
    // Enable extended thinking (budget ~half of max for complex code generation)
    thinking: { type: 'enabled', budget_tokens: 16000 },
  }
  if (toolDefs.length > 0) {
    body.tools = toolDefs
    body.tool_choice = { type: 'auto' }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
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

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

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
          } else if (block.type === 'thinking') {
            blocks.set(idx, { type: 'thinking', text: '', toolId: '', toolName: '', inputJson: '', thinking: '', signature: '' })
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
          } else if (delta.type === 'input_json_delta' && delta.partial_json) {
            block.inputJson += delta.partial_json
          } else if (delta.type === 'thinking_delta' && delta.thinking) {
            block.thinking += delta.thinking
            onChunk({ type: 'thinking_delta', text: delta.thinking })
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
          inputTokens = event.message.usage.input_tokens || 0
          outputTokens = event.message.usage.output_tokens || 0
        }
      } catch {
        // Skip malformed SSE lines
      }
    }
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

  return { text: fullText, toolUses, stopReason, inputTokens, outputTokens, thinkingBlocks }
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

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (isCancelled()) break

    onChunk({ type: 'status', state: 'thinking' })

    const response = await callOpenAI(
      baseUrl, apiKey, model, messages, toolDefs, onChunk,
    )

    // Send usage info to frontend
    if (response.inputTokens > 0 || response.outputTokens > 0) {
      onChunk({ type: 'usage', inputTokens: response.inputTokens, outputTokens: response.outputTokens })
    }

    if (response.text) {
      fullText += response.text
    }

    // If no tool calls, we're done
    if (response.toolUses.length === 0 || response.stopReason !== 'tool_use') {
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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
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
    if (done) break

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

  return { text: fullText, toolUses, stopReason, inputTokens, outputTokens, thinkingBlocks: [] }
}

// ─── 工具执行 ────────────────────────────────────────────────

async function executeTool(
  toolUse: ToolUse,
  context: ToolContext,
): Promise<{ content: string; isError: boolean }> {
  const tool = getTool(toolUse.name)
  if (!tool) {
    return { content: `Error: unknown tool "${toolUse.name}"`, isError: true }
  }

  console.log(`[Tool] Executing ${toolUse.name}: ${JSON.stringify(toolUse.input).slice(0, 200)}`)

  try {
    const result = await tool.execute(toolUse.input, context)
    console.log(`[Tool] ${toolUse.name} result: ${result.content.slice(0, 200)}`)
    return { content: result.content, isError: result.isError === true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[Tool] ${toolUse.name} error: ${msg}`)
    return { content: `Error executing tool ${toolUse.name}: ${msg}`, isError: true }
  }
}
