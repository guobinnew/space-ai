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

/** 向用户提问的选项 */
export type QuestionOption = {
  label: string
  description: string
}

/** 向用户提问的问题 */
export type QuestionItem = {
  question: string
  header: string
  options: QuestionOption[]
  multiSelect?: boolean
}

/** 待回答的问题（AskUserQuestion 工具触发） */
export type PendingQuestion = {
  requestId: string
  questions: QuestionItem[]
}

/** 待审批的计划（ExitPlanMode 工具触发） */
export type PendingPlan = {
  requestId: string
  plan: string
  isEnterMode?: boolean
}

export type PerSessionChatState = {
  messages: UIMessage[]
  chatState: ChatState
  streamingText: string
  /** 当前轮的工具调用列表（sendMessage 时清空） */
  toolCalls: ToolCallInfo[]
  /** 待回答的问题（AskUserQuestion） */
  pendingQuestion: PendingQuestion | null
  /** 待审批的计划（EnterPlanMode/ExitPlanMode） */
  pendingPlan: PendingPlan | null
}
