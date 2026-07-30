/**
 * Conversation Service — 会话管理 + LLM 流式调用
 *
 * 管理 session 的 LLM streaming，提供双向通信支持：
 *   - 服务端 → 前端：通过 outputCallback 发送 StreamChunk
 *   - 前端 → 服务端：通过 handleUserResponse 处理用户回答（AskUserQuestion/PlanMode）
 */

import { sessionService } from './sessionService'
import { streamChat, type StreamChunk } from './llmStreamService'
import type { AskUserRequest } from '../tools'

type SessionProcess = {
  sessionId: string
  workDir: string
  /** Active LLM streaming task (if any) */
  activeStream: AbortController | null
  /** Cancelled flag — set by stopSession, checked by agentic loop */
  cancelled: boolean
  /** Output callback — forwards to client WebSocket */
  outputCallback: ((chunk: StreamChunk) => void) | null
  /** Pending user response resolver (for AskUserQuestion / PlanMode) */
  pendingResolver: ((response: string) => void) | null
}

class ConversationService {
  private sessions = new Map<string, SessionProcess>()

  startSession(
    sessionId: string,
    workDir: string,
    onOutput: (chunk: StreamChunk) => void,
  ): void {
    if (this.sessions.has(sessionId)) {
      return
    }

    const proc: SessionProcess = {
      sessionId,
      workDir,
      activeStream: null,
      cancelled: false,
      outputCallback: onOutput,
      pendingResolver: null,
    }

    this.sessions.set(sessionId, proc)
    console.log(`[ConversationService] Session started: ${sessionId}`)
  }

  /**
   * Send a user message — triggers LLM streaming with agentic loop.
   * @param providerId 指定使用的 provider ID，不传则使用默认服务商
   */
  async sendMessage(sessionId: string, content: string, providerId?: string): Promise<void> {
    const proc = this.sessions.get(sessionId)
    if (!proc) {
      throw new Error(`Session not started: ${sessionId}`)
    }

    await sessionService.addMessage(sessionId, 'user', content)

    if (proc.activeStream) {
      proc.activeStream.abort()
    }

    proc.cancelled = false
    proc.activeStream = new AbortController()

    // askUser: send request to frontend via WS, wait for response
    const askUser = async (request: AskUserRequest): Promise<string> => {
      return new Promise<string>((resolve) => {
        proc.pendingResolver = resolve

        // Send the appropriate chunk to frontend
        if (request.kind === 'question' && request.questions) {
          proc.outputCallback?.({
            type: 'ask_question',
            requestId: request.id,
            questions: request.questions,
          })
        } else if (request.kind === 'plan' && request.plan) {
          proc.outputCallback?.({
            type: 'plan_proposal',
            requestId: request.id,
            plan: request.plan,
          })
        }
      })
    }

    await streamChat(
      sessionId,
      content,
      (chunk: StreamChunk) => {
        proc.outputCallback?.(chunk)
      },
      () => proc.cancelled,
      askUser,
      providerId,
    )
  }

  /**
   * Handle user response from frontend (AskUserQuestion answer or PlanMode approval).
   * Called by WS handler when client sends question_answer / plan_response.
   */
  handleUserResponse(sessionId: string, response: string): void {
    const proc = this.sessions.get(sessionId)
    if (!proc || !proc.pendingResolver) return

    proc.pendingResolver(response)
    proc.pendingResolver = null
  }

  stopSession(sessionId: string): void {
    const proc = this.sessions.get(sessionId)
    if (!proc) return

    proc.cancelled = true
    // Resolve any pending question with empty response (cancelled)
    if (proc.pendingResolver) {
      proc.pendingResolver('')
      proc.pendingResolver = null
    }
    if (proc.activeStream) {
      proc.activeStream.abort()
      proc.activeStream = null
    }
  }

  stopAllSessions(): void {
    for (const sessionId of this.sessions.keys()) {
      this.stopSession(sessionId)
    }
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys())
  }

  endSession(sessionId: string): void {
    this.stopSession(sessionId)
    this.sessions.delete(sessionId)
    console.log(`[ConversationService] Session ended: ${sessionId}`)
  }
}

export const conversationService = new ConversationService()
