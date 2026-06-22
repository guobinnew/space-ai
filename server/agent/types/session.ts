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

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export type CreateSessionInput = {
  workDir?: string
  title?: string
}
