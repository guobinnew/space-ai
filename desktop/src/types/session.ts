/**
 * Session type definitions (frontend)
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

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  /** Extended thinking content from Anthropic, only for assistant messages */
  thinking?: string
}

export type SessionDetail = SessionListItem & {
  messages: ChatMessage[]
}

export type TabType = 'home' | 'settings' | 'session'
