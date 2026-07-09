/**
 * Smart Space Agent Server — HTTP + WebSocket Server (Bun runtime)
 *
 * 参照 smart-code src/server/server.ts 复刻，使用 Bun.serve。
 * 为桌面端 UI 提供 REST API 和 WebSocket 实时通信。
 */

import { handleApiRequest } from './router'
import { corsHeaders } from './middleware/cors'
import { requireAuth } from './middleware/auth'
import { conversationService } from './services/conversationService'
import type { StreamChunk } from './services/llmStreamService'
import type { WebSocketData } from './types'

function readArgValue(flag: string): string | undefined {
  const args = process.argv.slice(2)
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  return args[index + 1]
}

function hasArgFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag)
}

function resolveServerOptions() {
  const portArg = readArgValue('--port')
  const port = Number.parseInt(portArg || process.env.SERVER_PORT || '3721', 10)
  const host = readArgValue('--host') || process.env.SERVER_HOST || '127.0.0.1'
  const authRequired = hasArgFlag('--auth-required')

  return { port, host, authRequired }
}

const SERVER_OPTIONS = resolveServerOptions()
const PORT = SERVER_OPTIONS.port
const HOST = SERVER_OPTIONS.host

export function startServer(port = PORT, host = HOST) {
  const localConnectHost =
    host === '0.0.0.0' || host === '127.0.0.1' || host === 'localhost'
      ? '127.0.0.1'
      : host

  /**
   * Auth is required when explicitly opted in or when bound to a non-localhost address.
   */
  const authRequired =
    SERVER_OPTIONS.authRequired ||
    process.env.SERVER_AUTH_REQUIRED === '1' ||
    host !== '127.0.0.1'

  const server = Bun.serve<WebSocketData>({
    port,
    hostname: host,

    async fetch(req, server) {
      const url = new URL(req.url)
      const origin = req.headers.get('Origin')

      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) })
      }

      // WebSocket upgrade — client channel
      if (url.pathname.startsWith('/ws/')) {
        if (url.pathname === '/ws/stt') {
          const upgraded = server.upgrade(req, {
            data: {
              sessionId: `stt-${Date.now()}`,
              connectedAt: Date.now(),
              channel: 'stt',
              sdkToken: null,
              serverPort: port,
              serverHost: localConnectHost,
            },
          })
          if (upgraded) return undefined
          return new Response('WebSocket upgrade failed', { status: 400 })
        }

        if (authRequired) {
          const authError = requireAuth(req)
          if (authError) return authError
        }

        const sessionId = url.pathname.split('/').pop() || ''
        if (!sessionId || !/^[0-9a-zA-Z_-]{1,64}$/.test(sessionId)) {
          return new Response('Invalid session ID', { status: 400 })
        }
        const imChannel = url.searchParams.get('imChannel') || undefined
        const upgraded = server.upgrade(req, {
          data: {
            sessionId,
            connectedAt: Date.now(),
            channel: 'client',
            sdkToken: null,
            serverPort: port,
            serverHost: localConnectHost,
            imChannel,
          },
        })
        if (upgraded) return undefined
        return new Response('WebSocket upgrade failed', { status: 400 })
      }

      // Internal SDK WebSocket
      if (url.pathname.startsWith('/sdk/')) {
        const sessionId = url.pathname.split('/').pop() || ''
        if (!sessionId || !/^[0-9a-zA-Z_-]{1,64}$/.test(sessionId)) {
          return new Response('Invalid session ID', { status: 400 })
        }
        const upgraded = server.upgrade(req, {
          data: {
            sessionId,
            connectedAt: Date.now(),
            channel: 'sdk',
            sdkToken: url.searchParams.get('token'),
            serverPort: port,
            serverHost: localConnectHost,
          },
        })
        if (upgraded) return undefined
        return new Response('WebSocket upgrade failed', { status: 400 })
      }

      // REST API
      if (url.pathname.startsWith('/api/')) {
        if (authRequired) {
          const authError = requireAuth(req)
          if (authError) return authError
        }

        try {
          const response = await handleApiRequest(req, url)
          const headers = new Headers(response.headers)
          for (const [key, value] of Object.entries(corsHeaders(origin))) {
            headers.set(key, value)
          }
          return new Response(response.body, {
            status: response.status,
            headers,
          })
        } catch (error) {
          console.error('[Server] API error:', error)
          return Response.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders() },
          )
        }
      }

      // Health check
      if (url.pathname === '/health' || url.pathname === '/api/health') {
        return Response.json(
          { status: 'ok', timestamp: new Date().toISOString() },
          { headers: corsHeaders(origin) },
        )
      }

      // Server info (compatible with existing frontend)
      if (url.pathname === '/api/info') {
        return Response.json(
          {
            name: 'smart-space-agent',
            version: process.env.APP_VERSION || '0.1.0',
            nodeVersion: process.version,
            bunVersion: typeof Bun !== 'undefined' ? Bun.version : 'N/A',
            platform: process.platform,
            uptime: process.uptime(),
          },
          { headers: corsHeaders(origin) },
        )
      }

      // Favicon
      if (url.pathname === '/favicon.ico') {
        return new Response(null, { status: 204 })
      }

      return new Response('Not Found', { status: 404 })
    },

    websocket: {
      open(ws) {
        console.log(`[WS] Open: ${ws.data.sessionId} (${ws.data.channel})`)
        ws.send(JSON.stringify({ type: 'connected', sessionId: ws.data.sessionId }))

        // Start a CLI sidecar for this session when client connects
        if (ws.data.channel === 'client') {
          conversationService.startSession(ws.data.sessionId, '', (chunk: StreamChunk) => {
            ws.send(JSON.stringify(chunk))
          })
        }
      },
      async message(ws, message) {
        const text = message.toString()
        console.log(`[WS] Message from ${ws.data.sessionId}:`, text.slice(0, 100))

        // Only handle client channel
        if (ws.data.channel !== 'client') return

        try {
          const data = JSON.parse(text) as { type: string; content?: string; answer?: string; response?: string }

          if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }))
            return
          }

          if (data.type === 'user_message' && data.content) {
            const sessionId = ws.data.sessionId
            const userContent = data.content

            await conversationService.sendMessage(sessionId, userContent)
          }

          if (data.type === 'stop_generation') {
            conversationService.stopSession(ws.data.sessionId)
            ws.send(JSON.stringify({ type: 'status', state: 'idle' }))
          }

          // User answered a question (AskUserQuestion)
          if (data.type === 'question_answer' && data.answer !== undefined) {
            conversationService.handleUserResponse(ws.data.sessionId, data.answer)
          }

          // User responded to a plan proposal (EnterPlanMode/ExitPlanMode)
          if (data.type === 'plan_response' && data.response !== undefined) {
            conversationService.handleUserResponse(ws.data.sessionId, data.response)
          }
        } catch (err) {
          console.error(`[WS] Error processing message:`, err)
          ws.send(JSON.stringify({
            type: 'error',
            message: err instanceof Error ? err.message : 'Internal error',
          }))
        }
      },
      close(ws) {
        console.log(`[WS] Closed: ${ws.data.sessionId}`)
        // End the CLI sidecar for this session when client disconnects
        if (ws.data.channel === 'client') {
          conversationService.endSession(ws.data.sessionId)
        }
      },
      drain(_ws) {
        // Called when the server is ready to send more messages
      },
    },
  })

  console.log(`[SmartSpace Agent] Running on http://${host}:${port}`)
  console.log(`[SmartSpace Agent] Health check: http://${host}:${port}/api/health`)
  return server
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

let isShuttingDown = false

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log(`[SmartSpace Agent] Received ${signal}, shutting down...`)
  await new Promise<void>((resolve) => setTimeout(resolve, 200))
  console.log('[SmartSpace Agent] Shutdown complete')
  process.exitCode = 0
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => void gracefulShutdown('SIGINT'))
