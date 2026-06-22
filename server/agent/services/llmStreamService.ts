/**
 * LLM Streaming Service — 调用 LLM API 并流式返回
 *
 * 使用活跃 provider 配置，通过 fetch streaming 调用 LLM API。
 * 支持 Anthropic 和 OpenAI 两种 API 格式。
 */

import { sessionService } from './sessionService'
import { ProviderService } from './providerService'
import type { ApiFormat } from '../types/provider'

const providerService = new ProviderService()

export type StreamChunk =
  | { type: 'content_start' }
  | { type: 'content_delta'; text: string }
  | { type: 'status'; state: 'thinking' | 'streaming' | 'idle' }
  | { type: 'message_complete' }
  | { type: 'error'; message: string }

/**
 * 调用 LLM API 并流式返回结果。
 * 调用方通过 onChunk 回调接收流式数据。
 */
export async function streamChat(
  sessionId: string,
  userContent: string,
  onChunk: (chunk: StreamChunk) => void,
): Promise<void> {
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

  // Build message history
  const messages = await sessionService.getMessages(sessionId)
  const chatHistory = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  // Add current user message
  chatHistory.push({ role: 'user', content: userContent })

  onChunk({ type: 'status', state: 'thinking' })
  onChunk({ type: 'content_start' })

  const format: ApiFormat = provider.apiFormat ?? 'anthropic'
  const baseUrl = provider.baseUrl.replace(/\/+$/, '')

  try {
    if (format === 'anthropic') {
      await streamAnthropic(sessionId, baseUrl, provider.apiKey, provider.models.main, chatHistory, onChunk)
    } else {
      await streamOpenAI(sessionId, baseUrl, provider.apiKey, provider.models.main, chatHistory, onChunk)
    }
    onChunk({ type: 'status', state: 'idle' })
    onChunk({ type: 'message_complete' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    onChunk({ type: 'error', message })
    onChunk({ type: 'status', state: 'idle' })
  }
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

/**
 * Anthropic Messages API 流式调用
 */
async function streamAnthropic(
  sessionId: string,
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  onChunk: (chunk: StreamChunk) => void,
): Promise<void> {
  const url = `${baseUrl}/v1/messages`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages,
      stream: true,
    }),
    signal: AbortSignal.timeout(120000),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Anthropic API ${response.status}: ${errText.slice(0, 200)}`)
  }

  if (!response.body) throw new Error('No response body')

  onChunk({ type: 'status', state: 'streaming' })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

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
        if (event.type === 'content_block_delta' && event.delta?.text) {
          fullText += event.delta.text
          onChunk({ type: 'content_delta', text: event.delta.text })
        }
      } catch {
        // Skip malformed SSE lines
      }
    }
  }

  // Save assistant response
  if (fullText) {
    await sessionService.addMessage(sessionId, 'assistant', fullText)
  }
}

/**
 * OpenAI Chat Completions API 流式调用
 */
async function streamOpenAI(
  sessionId: string,
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  onChunk: (chunk: StreamChunk) => void,
): Promise<void> {
  const url = `${baseUrl}/chat/completions`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages,
      stream: true,
    }),
    signal: AbortSignal.timeout(120000),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`OpenAI API ${response.status}: ${errText.slice(0, 200)}`)
  }

  if (!response.body) throw new Error('No response body')

  onChunk({ type: 'status', state: 'streaming' })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

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
        const delta = event.choices?.[0]?.delta?.content
        if (delta) {
          fullText += delta
          onChunk({ type: 'content_delta', text: delta })
        }
      } catch {
        // Skip malformed SSE lines
      }
    }
  }

  // Save assistant response
  if (fullText) {
    await sessionService.addMessage(sessionId, 'assistant', fullText)
  }
}
