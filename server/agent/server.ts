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
import { cleanupEmptyProvider } from './services/usageService'
import { startScheduler } from './services/cronScheduler'
import type { StreamChunk } from './services/llmStreamService'
import type { WebSocketData } from './types'
import path from 'node:path'
import os from 'node:os'

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

// ─── Port conflict resolution ─────────────────────────────────────────────────

/** Path to the file where the actual listening port is written for the desktop client. */
function getServerPortFilePath(): string {
  const configDir = process.env.SPACEAI_CONFIG_DIR || path.join(os.homedir(), '.spaceai')
  return path.join(configDir, 'server.port')
}

/** Write the actual port to ~/.spaceai/server.port so the desktop client can discover it. */
function writePortFile(port: number): void {
  try {
    const filePath = getServerPortFilePath()
    Bun.write(filePath, String(port))
    console.log(`[SmartSpace Agent] Port file written: ${filePath} → ${port}`)
  } catch (err) {
    console.error('[SmartSpace Agent] Failed to write port file:', err)
  }
}

/** Delete the port file (called on shutdown). */
function deletePortFile(): void {
  try {
    const filePath = getServerPortFilePath()
    Bun.write(filePath, '') // Truncate rather than unlink (safer on Windows)
  } catch {
    // Ignore — file may not exist
  }
}

/**
 * Health-check a port to determine if a real server is listening.
 * Returns true if a working server responds, false if the port is a zombie socket or nobody is listening.
 */
async function isPortServing(port: number, host: string): Promise<boolean> {
  try {
    const checkHost = host === '0.0.0.0' ? '127.0.0.1' : host
    const res = await fetch(`http://${checkHost}:${port}/api/health`, {
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Try to create a Bun.serve instance on the given port.
 * On EADDRINUSE:
 *   1. Health-check the port — if a real server is already running, exit 0 (the desktop client can use it).
 *   2. If it's a zombie socket (health check fails), retry up to `maxRetries` times with `retryDelayMs` delay.
 *   3. If still failing, try a sequence of fallback ports.
 * The actual port is written to ~/.spaceai/server.port.
 */
async function serveWithRetry(
  buildOptions: (port: number) => Parameters<typeof Bun.serve<WebSocketData>>[0],
  config: {
    primaryPort: number
    maxRetries?: number
    retryDelayMs?: number
    fallbackPorts?: number[]
  },
): Promise<ReturnType<typeof Bun.serve<WebSocketData>>> {
  const { primaryPort, maxRetries = 5, retryDelayMs = 1000, fallbackPorts = [] } = config
  const portsToTry = [primaryPort, ...fallbackPorts]

  for (const tryPort of portsToTry) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const server = Bun.serve<WebSocketData>(buildOptions(tryPort))
        writePortFile(tryPort)
        return server
      } catch (err: any) {
        if (err?.code !== 'EADDRINUSE') throw err

        // Port is in use — check if a real server is behind it
        const serving = await isPortServing(tryPort, '127.0.0.1')
        if (serving) {
          console.log(
            `[SmartSpace Agent] Port ${tryPort} already has a working server. ` +
              `Another instance is running — exiting gracefully.`,
          )
          writePortFile(tryPort)
          process.exit(0)
        }

        // Zombie socket — retry
        if (attempt < maxRetries) {
          console.log(
            `[SmartSpace Agent] Port ${tryPort} in use (zombie socket?), ` +
              `retrying in ${retryDelayMs}ms... (${attempt + 1}/${maxRetries})`,
          )
          await new Promise((r) => setTimeout(r, retryDelayMs))
        }
      }
    }
    console.log(
      `[SmartSpace Agent] Port ${tryPort} unavailable after ${maxRetries + 1} attempts, trying next...`,
    )
  }

  throw new Error(
    `Failed to start server: all ports ${portsToTry.join(', ')} are in use.`,
  )
}

export async function startServer(port = PORT, host = HOST) {
  // 启动时自动清理服务商为空的旧用量记录
  cleanupEmptyProvider().then((removed) => {
    if (removed > 0) console.log(`[Usage] 已清理 ${removed} 条服务商为空的用量记录`)
  }).catch(() => {})

  // 启动定时任务调度器
  startScheduler()

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

  // Mutable — set after the server binds so handlers can read the actual port.
  let actualPort = port

  // Fallback ports: try all ports in 3721-3725 range (excluding the primary).
  // This ensures 3721 is always in the fallback list even when the primary
  // port is a previously-persisted non-default port (e.g. 3723).
  const fallbackPorts = [3721, 3722, 3723, 3724, 3725].filter((p) => p !== port)

  const server = await serveWithRetry(
    (tryPort) => ({
      port: tryPort,
      hostname: host,

      async fetch(req, srv) {
        const url = new URL(req.url)
        const origin = req.headers.get('Origin')

        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: corsHeaders(origin) })
        }

        // WebSocket upgrade — client channel
        if (url.pathname.startsWith('/ws/')) {
          if (url.pathname === '/ws/stt') {
            const upgraded = srv.upgrade(req, {
              data: {
                sessionId: `stt-${Date.now()}`,
                connectedAt: Date.now(),
                channel: 'stt',
                sdkToken: null,
                serverPort: actualPort,
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
          const upgraded = srv.upgrade(req, {
            data: {
              sessionId,
              connectedAt: Date.now(),
              channel: 'client',
              sdkToken: null,
              serverPort: actualPort,
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
          const upgraded = srv.upgrade(req, {
            data: {
              sessionId,
              connectedAt: Date.now(),
              channel: 'sdk',
              sdkToken: url.searchParams.get('token'),
              serverPort: actualPort,
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
    }),
    { primaryPort: port, maxRetries: 5, retryDelayMs: 1000, fallbackPorts },
  )

  actualPort = server.port

  console.log(`[SmartSpace Agent] Running on http://${host}:${actualPort}`)
  console.log(`[SmartSpace Agent] Health check: http://${host}:${actualPort}/api/health`)
  return server
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

let isShuttingDown = false

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log(`[SmartSpace Agent] Received ${signal}, shutting down...`)
  deletePortFile()
  await new Promise<void>((resolve) => setTimeout(resolve, 200))
  console.log('[SmartSpace Agent] Shutdown complete')
  process.exitCode = 0
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => void gracefulShutdown('SIGINT'))
