/**
 * Session type definitions
 *
 * 参照 smart-code types/session.ts 复刻，简化版。
 */

export type SessionListItem = {
  id: string
  title: string
  createdAt: string
  modifiedAt: string
  messageCount: number
  workDir?: string
}

export type SessionDetail = SessionListItem & {
  messages: ChatMessage[]
}

export type ToolCallData = {
  id: string
  toolName: string
  input: Record<string, unknown>
  result?: string
  isError?: boolean
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  /** Extended thinking content from Anthropic, only for assistant messages */
  thinking?: string
  /** Tool calls associated with this assistant message */
  toolCalls?: ToolCallData[]
}

export type CreateSessionInput = {
  workDir?: string
  title?: string
}
