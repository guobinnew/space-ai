/**
 * Conversation Service — 每次会话用 Bun.spawn 新建 CLI sidecar 子进程
 *
 * 参照 smart-code conversationService.ts 复刻。
 * CLI sidecar 是一个独立的 sidecar.ts 进程，以 "cli" 模式启动，
 * 通过 stdin/stdout stream-json 与 Server sidecar 通信。
 *
 * 架构：
 *   Desktop UI ──(Client WS)──> Server sidecar ──(stdin/stdout)──> CLI sidecar
 *                                                    │
 *                                                    ├── stdin: Server → CLI (stream-json)
 *                                                    └── stdout: CLI → Server (stream-json)
 */

import { sessionService } from './sessionService'
import { streamChat, type StreamChunk } from './llmStreamService'
import type { ChatMessage } from '../types/session'

type SessionProcess = {
  sessionId: string
  workDir: string
  /** Active LLM streaming task (if any) */
  activeStream: AbortController | null
  /** Cancelled flag — set by stopSession, checked by agentic loop */
  cancelled: boolean
  /** Output callback — forwards to client WebSocket */
  outputCallback: ((chunk: StreamChunk) => void) | null
}

class ConversationService {
  private sessions = new Map<string, SessionProcess>()

  /**
   * Start a "CLI sidecar" for a session.
   * In smart-code this spawns a real CLI process via Bun.spawn.
   * Here we simulate it by setting up the session for LLM streaming.
   */
  startSession(
    sessionId: string,
    workDir: string,
    onOutput: (chunk: StreamChunk) => void,
  ): void {
    if (this.sessions.has(sessionId)) {
      return // Already started
    }

    const proc: SessionProcess = {
      sessionId,
      workDir,
      activeStream: null,
      cancelled: false,
      outputCallback: onOutput,
    }

    this.sessions.set(sessionId, proc)
    console.log(`[ConversationService] Session started: ${sessionId}`)
  }

  /**
   * Send a user message to the session's CLI sidecar.
   * This triggers the LLM streaming and forwards chunks via outputCallback.
   */
  async sendMessage(sessionId: string, content: string): Promise<void> {
    const proc = this.sessions.get(sessionId)
    if (!proc) {
      throw new Error(`Session not started: ${sessionId}`)
    }

    // Save user message
    await sessionService.addMessage(sessionId, 'user', content)

    // Cancel any existing stream
    if (proc.activeStream) {
      proc.activeStream.abort()
    }

    proc.cancelled = false
    proc.activeStream = new AbortController()

    // Stream LLM response, forwarding chunks to the client
    await streamChat(
      sessionId,
      content,
      (chunk: StreamChunk) => {
        proc.outputCallback?.(chunk)
      },
      () => proc.cancelled,
    )
  }

  /**
   * Stop the active generation for a session.
   */
  stopSession(sessionId: string): void {
    const proc = this.sessions.get(sessionId)
    if (!proc) return

    proc.cancelled = true
    if (proc.activeStream) {
      proc.activeStream.abort()
      proc.activeStream = null
    }
  }

  /**
   * Stop all sessions (e.g. on provider switch).
   */
  stopAllSessions(): void {
    for (const sessionId of this.sessions.keys()) {
      this.stopSession(sessionId)
    }
  }

  /**
   * Get active session IDs.
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys())
  }

  /**
   * End a session and clean up its CLI sidecar.
   */
  endSession(sessionId: string): void {
    this.stopSession(sessionId)
    this.sessions.delete(sessionId)
    console.log(`[ConversationService] Session ended: ${sessionId}`)
  }
}

export const conversationService = new ConversationService()
