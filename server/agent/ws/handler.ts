/**
 * WebSocket handler (桩实现)
 *
 * 参照 smart-code src/server/ws/handler.ts 的接口结构。
 * 当前为桩实现，仅维持连接心跳。
 */

import type { WebSocketData } from '../types'

type ServerWebSocket = {
  send: (data: string) => void
  close: () => void
  subscribe: (topic: string) => void
  publish: (topic: string, data: string) => void
  data: WebSocketData
}

export function handleWebSocket(ws: ServerWebSocket): void {
  console.log(`[WS] Client connected: sessionId=${ws.data.sessionId}, channel=${ws.data.channel}`)

  ws.send(JSON.stringify({ type: 'connected', sessionId: ws.data.sessionId }))

  // Keep connection alive — full implementation pending
}

export function handleWebSocketOpen(ws: ServerWebSocket): void {
  console.log(`[WS] Open: ${ws.data.sessionId}`)
}

export function handleWebSocketMessage(ws: ServerWebSocket, message: string | Buffer): void {
  // Echo back for now — full implementation pending
  console.log(`[WS] Message from ${ws.data.sessionId}:`, message.toString().slice(0, 100))
}

export function handleWebSocketClose(ws: ServerWebSocket): void {
  console.log(`[WS] Closed: ${ws.data.sessionId}`)
}

export function handleWebSocketError(ws: ServerWebSocket, error: unknown): void {
  console.error(`[WS] Error on ${ws.data.sessionId}:`, error)
}
