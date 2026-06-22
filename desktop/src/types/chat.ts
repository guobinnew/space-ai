/**
 * Chat types — 聊天消息和状态类型
 *
 * 参照 smart-code types/chat.ts 复刻，简化版。
 */

export type ChatState = 'idle' | 'thinking' | 'streaming'

export type UIMessage =
  | { type: 'user_text'; id: string; content: string; createdAt: string }
  | { type: 'assistant_text'; id: string; content: string; createdAt: string }
  | { type: 'error'; id: string; message: string; createdAt: string }

export type PerSessionChatState = {
  messages: UIMessage[]
  chatState: ChatState
  streamingText: string
}
