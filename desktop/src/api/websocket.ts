/**
 * WebSocket Manager — 会话级 WS 连接管理
 *
 * 参照 smart-code api/websocket.ts 复刻，简化版。
 * 每个会话一个 WS 连接（连到该会话专属的 sidecar 端口），支持消息处理器注册和心跳。
 */

type ServerMessage =
  | { type: 'connected'; sessionId: string }
  | { type: 'content_start' }
  | { type: 'content_delta'; text: string }
  | { type: 'status'; state: 'thinking' | 'streaming' | 'idle' }
  | { type: 'tool_call'; toolCallId: string; toolName: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; result: string; isError: boolean }
  | { type: 'message_complete' }
  | { type: 'error'; message: string }
  | { type: 'pong' }

type ClientMessage =
  | { type: 'user_message'; content: string }
  | { type: 'stop_generation' }
  | { type: 'ping' }

type MessageHandler = (msg: ServerMessage) => void

type Connection = {
  ws: WebSocket
  handlers: Set<MessageHandler>
  pingInterval: ReturnType<typeof setInterval> | null
  intentionalClose: boolean
}

class WebSocketManager {
  private connections = new Map<string, Connection>()

  /** Connect to a session's sidecar on the given port */
  connect(sessionId: string, port: number = 3721): void {
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
      handlers: new Set(),
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
        conn.handlers.forEach((h) => h(msg))
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
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return
    conn.ws.send(JSON.stringify(message))
  }

  onMessage(sessionId: string, handler: MessageHandler): () => void {
    const conn = this.connections.get(sessionId)
    conn?.handlers.add(handler)
    return () => {
      conn?.handlers.delete(handler)
    }
  }

  clearHandlers(sessionId: string): void {
    const conn = this.connections.get(sessionId)
    conn?.handlers.clear()
  }

  isConnected(sessionId: string): boolean {
    const conn = this.connections.get(sessionId)
    return !!conn && conn.ws.readyState === WebSocket.OPEN
  }
}

export const wsManager = new WebSocketManager()
export type { ServerMessage, ClientMessage, MessageHandler }
