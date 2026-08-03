/**
 * WebSocket Manager — 会话级 WS 连接管理
 *
 * 参照 smart-code api/websocket.ts 复刻，简化版。
 * 每个会话一个 WS 连接（连到该会话专属的 sidecar 端口），支持消息处理器注册和心跳。
 *
 * handlers 独立于 Connection 存储，确保：
 * 1. 连接建立前注册的 handler 不会丢失
 * 2. 重连后 handler 自动恢复
 */

type ServerMessage =
  | { type: 'connected'; sessionId: string }
  | { type: 'content_start' }
  | { type: 'content_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'status'; state: 'thinking' | 'streaming' | 'idle' }
  | { type: 'tool_call'; toolCallId: string; toolName: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; result: string; isError: boolean }
  | { type: 'ask_question'; requestId: string; questions: unknown[] }
  | { type: 'plan_proposal'; requestId: string; plan: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }
  | { type: 'usage_total'; totalInput: number; totalOutput: number; totalCacheRead: number; totalCacheCreation: number }
  | { type: 'message_complete' }
  | { type: 'error'; message: string }
  | { type: 'pong' }

type ClientMessage =
  | { type: 'user_message'; content: string; providerId?: string }
  | { type: 'stop_generation' }
  | { type: 'ping' }
  | { type: 'question_answer'; answer: string }
  | { type: 'plan_response'; response: string }

type MessageHandler = (msg: ServerMessage) => void

type Connection = {
  ws: WebSocket
  port: number
  pingInterval: ReturnType<typeof setInterval> | null
  intentionalClose: boolean
}

class WebSocketManager {
  private connections = new Map<string, Connection>()
  /** Handlers stored independently of connections — survive reconnections and pre-connection registration. */
  private messageHandlers = new Map<string, Set<MessageHandler>>()

  /** Connect to a session's sidecar on the given port */
  connect(sessionId: string, port: number): void {
    // Already connected or connecting
    const existing = this.connections.get(sessionId)
    if (existing) {
      // If marked for delayed disconnect, cancel it by resetting flag
      existing.intentionalClose = false
      if (existing.ws.readyState === WebSocket.OPEN || existing.ws.readyState === WebSocket.CONNECTING) {
        return
      }
      // Stale connection — clean up before reconnecting
      this.connections.delete(sessionId)
    }

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${sessionId}`)
    const conn: Connection = {
      ws,
      port,
      pingInterval: null,
      intentionalClose: false,
    }

    ws.onopen = () => {
      console.log(`[WS] Connected: ${sessionId} (port ${port})`)
      conn.pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 30000)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage
        const handlers = this.messageHandlers.get(sessionId)
        handlers?.forEach((h) => h(msg))
      } catch {
        // Ignore malformed messages
      }
    }

    ws.onclose = () => {
      console.log(`[WS] Closed: ${sessionId}`)
      if (conn.pingInterval) clearInterval(conn.pingInterval)
      if (!conn.intentionalClose) {
        // Auto-reconnect after 2s (only if connection still expected)
        setTimeout(() => {
          if (!this.connections.has(sessionId)) {
            this.connect(sessionId, port)
          }
        }, 2000)
      } else {
        this.connections.delete(sessionId)
      }
    }

    ws.onerror = (err) => {
      console.error(`[WS] Error: ${sessionId}`, err)
    }

    this.connections.set(sessionId, conn)
  }

  disconnect(sessionId: string): void {
    const conn = this.connections.get(sessionId)
    if (!conn) return
    conn.intentionalClose = true
    if (conn.pingInterval) clearInterval(conn.pingInterval)
    conn.ws.close()
    this.connections.delete(sessionId)
  }

  /** Disconnect with a small delay to avoid React StrictMode connect-disconnect-connect race */
  disconnectDelayed(sessionId: string, delay: number = 100): void {
    // Mark as intentional close, but defer the actual close
    const conn = this.connections.get(sessionId)
    if (conn) conn.intentionalClose = true

    setTimeout(() => {
      // If a new connection was established in the meantime (reconnect),
      // it will have intentionalClose=false, so skip the disconnect
      const current = this.connections.get(sessionId)
      if (!current || !current.intentionalClose) return
      this.disconnect(sessionId)
    }, delay)
  }

  send(sessionId: string, message: ClientMessage): void {
    const conn = this.connections.get(sessionId)
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
      // 消息被静默丢弃是难排查的 bug 源头——这里显式告警
      console.warn(`[ws] 消息未发送（WS 未连接）session=${sessionId} type=${message.type}`)
      return
    }
    conn.ws.send(JSON.stringify(message))
  }

  onMessage(sessionId: string, handler: MessageHandler): () => void {
    let handlers = this.messageHandlers.get(sessionId)
    if (!handlers) {
      handlers = new Set()
      this.messageHandlers.set(sessionId, handlers)
    }
    handlers.add(handler)
    return () => {
      handlers?.delete(handler)
    }
  }

  clearHandlers(sessionId: string): void {
    this.messageHandlers.delete(sessionId)
  }

  isConnected(sessionId: string): boolean {
    const conn = this.connections.get(sessionId)
    return !!conn && conn.ws.readyState === WebSocket.OPEN
  }
}

export const wsManager = new WebSocketManager()
export type { ServerMessage, ClientMessage, MessageHandler }
