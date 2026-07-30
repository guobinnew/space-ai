/**
 * Sub-Agent Runner — 子代理执行器
 *
 * 为 AgentTool 提供独立的子代理 LLM 调用和工具循环。
 * 不影响主会话的流式输出，返回纯文本结果。
 */

import { getTool, getToolDefinitions } from '../tools/registry'
import type { ToolContext, ToolResult } from '../tools/types'
import type { AgentDefinition } from './agentService'
import { getAgentToolNames } from './agentService'
import { ProviderService } from './providerService'
import type { ApiFormat } from '../types/provider'

const providerService = new ProviderService()

function makeTimeout(ms: number): AbortSignal {
  const controller = new AbortController()
  setTimeout(() => controller.abort(new Error(`Sub-agent LLM call timed out after ${ms / 1000}s`)), ms)
  return controller.signal
}

// ─── Types ───

type SubAgentMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

type SubAgentResult = {
  text: string
  toolUses: number
}

const MAX_SUB_AGENT_ROUNDS = 20

// ─── LLM Call (Anthropic) ───

async function callAnthropicSubAgent(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string | Array<Record<string, unknown>> }>,
  toolDefs: Array<{ name: string; description: string; input_schema: unknown }>,
): Promise<{ text: string; toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> }> {
  const url = `${baseUrl}/v1/messages`
  const body: Record<string, unknown> = {
    model,
    max_tokens: 16000,
    system: systemPrompt,
    messages,
    stream: false,
  }
  if (toolDefs.length > 0) {
    body.tools = toolDefs.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }))
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: makeTimeout(120_000),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Anthropic API ${response.status}: ${errText.slice(0, 300)}`)
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>
  }

  const textBlocks: string[] = []
  const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

  for (const block of data.content ?? []) {
    if (block.type === 'text' && block.text) {
      textBlocks.push(block.text)
    } else if (block.type === 'tool_use' && block.id && block.name) {
      toolUses.push({ id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> })
    }
  }

  return { text: textBlocks.join(''), toolUses }
}

// ─── LLM Call (OpenAI) ───

async function callOpenAISubAgent(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: SubAgentMessage[],
  toolDefs: Array<{ name: string; description: string; input_schema: unknown }>,
): Promise<{ text: string; toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> }> {
  const url = `${baseUrl}/chat/completions`
  const body: Record<string, unknown> = {
    model,
    max_tokens: 16000,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    stream: false,
  }
  if (toolDefs.length > 0) {
    body.tools = toolDefs.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
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
    signal: makeTimeout(120_000),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`OpenAI API ${response.status}: ${errText.slice(0, 300)}`)
  }

  const data = (await response.json()) as {
    choices: Array<{
      message: {
        content: string | null
        tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>
      }
    }>
  }

  const message = data.choices?.[0]?.message
  if (!message) throw new Error('No message in response')

  const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = []
  for (const tc of message.tool_calls ?? []) {
    try {
      toolUses.push({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      })
    } catch {
      toolUses.push({ id: tc.id, name: tc.function.name, input: {} })
    }
  }

  return { text: message.content ?? '', toolUses }
}

// ─── Tool Execution ───

async function executeSubAgentTool(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const tool = getTool(toolName)
  if (!tool) {
    return { content: `Error: unknown tool "${toolName}"`, isError: true }
  }
  try {
    return await tool.execute(input, context)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { content: `Error executing tool ${toolName}: ${msg}`, isError: true }
  }
}

// ─── Main Runner ───

export async function runSubAgent(
  agent: AgentDefinition,
  prompt: string,
  parentContext: ToolContext,
): Promise<SubAgentResult> {
  // 获取 provider 配置
  const { providers, defaultId } = await providerService.listProviders()
  const provider = providers.find((p) => p.id === defaultId)
  if (!provider) throw new Error('No active provider')
  const format: ApiFormat = provider.apiFormat ?? 'anthropic'
  const baseUrl = provider.baseUrl.replace(/\/+$/, '')
  const model = agent.model && agent.model !== 'inherit' ? agent.model : provider.models.main
  const apiKey = provider.apiKey

  // 过滤工具
  const allowedToolNames = new Set(getAgentToolNames(agent))
  const allToolDefs = getToolDefinitions()
  const filteredToolDefs = allToolDefs.filter((t) => allowedToolNames.has(t.name))

  // 构建子代理上下文（与父上下文共享 workDir/sessionId，但不共享 askUser）
  const subContext: ToolContext = {
    workDir: parentContext.workDir,
    sessionId: parentContext.sessionId,
    providerName: parentContext.providerName,
  }

  let totalToolUses = 0

  if (format === 'openai') {
    // OpenAI 格式
    const messages: SubAgentMessage[] = [{ role: 'user', content: prompt }]

    for (let round = 0; round < MAX_SUB_AGENT_ROUNDS; round++) {
      const result = await callOpenAISubAgent(baseUrl, apiKey, model, agent.systemPrompt, messages, filteredToolDefs)
      totalToolUses += result.toolUses.length

      if (result.toolUses.length === 0) {
        return { text: result.text, toolUses: totalToolUses }
      }

      // 添加 assistant 消息
      messages.push({
        role: 'assistant',
        content: result.text || null,
        tool_calls: result.toolUses.map((tu) => ({
          id: tu.id,
          type: 'function' as const,
          function: { name: tu.name, arguments: JSON.stringify(tu.input) },
        })),
      })

      // 执行工具并添加结果
      for (const tu of result.toolUses) {
        const toolResult = await executeSubAgentTool(tu.name, tu.input, subContext)
        messages.push({
          role: 'tool',
          content: toolResult.content,
          tool_call_id: tu.id,
        })
      }
    }

    return { text: `[子代理达到最大轮次 ${MAX_SUB_AGENT_ROUNDS}]`, toolUses: totalToolUses }
  }

  // Anthropic 格式
  const messages: Array<{ role: 'user' | 'assistant'; content: string | Array<Record<string, unknown>> }> = [
    { role: 'user', content: prompt },
  ]

  for (let round = 0; round < MAX_SUB_AGENT_ROUNDS; round++) {
    const result = await callAnthropicSubAgent(baseUrl, apiKey, model, agent.systemPrompt, messages, filteredToolDefs)
    totalToolUses += result.toolUses.length

    if (result.toolUses.length === 0) {
      return { text: result.text, toolUses: totalToolUses }
    }

    // 构建 assistant content blocks
    const assistantContent: Array<Record<string, unknown>> = []
    if (result.text) {
      assistantContent.push({ type: 'text', text: result.text })
    }
    for (const tu of result.toolUses) {
      assistantContent.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input })
    }
    messages.push({ role: 'assistant', content: assistantContent })

    // 执行工具并添加结果
    const toolResults: Array<Record<string, unknown>> = []
    for (const tu of result.toolUses) {
      const toolResult = await executeSubAgentTool(tu.name, tu.input, subContext)
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: toolResult.content,
        is_error: toolResult.isError,
      })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return { text: `[子代理达到最大轮次 ${MAX_SUB_AGENT_ROUNDS}]`, toolUses: totalToolUses }
}
