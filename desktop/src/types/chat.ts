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

/** 工具调用状态 */
export type ToolCallStatus = 'running' | 'completed' | 'error'

/** 单次工具调用信息（流式过程中显示） */
export type ToolCallInfo = {
  id: string
  toolName: string
  input: Record<string, unknown>
  result?: string
  isError?: boolean
  status: ToolCallStatus
}

export type PerSessionChatState = {
  messages: UIMessage[]
  chatState: ChatState
  streamingText: string
  /** 当前轮的工具调用列表（sendMessage 时清空） */
  toolCalls: ToolCallInfo[]
}
