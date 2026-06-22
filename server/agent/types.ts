/**
 * Smart Space Agent Server — Type Definitions
 *
 * 参照 smart-code src/server/types.ts 复刻，适配 SpaceAI 场景。
 */

export type ServerConfig = {
  port: number
  host: string
  authToken?: string
  /** Idle timeout for detached sessions (ms). 0 = never expire. */
  idleTimeoutMs?: number
  /** Maximum number of concurrent sessions. */
  maxSessions?: number
  /** Default workspace directory for sessions that don't specify cwd. */
  workspace?: string
}

export type SessionState =
  | 'starting'
  | 'running'
  | 'detached'
  | 'stopping'
  | 'stopped'

export type SessionInfo = {
  id: string
  status: SessionState
  createdAt: number
  workDir: string
}

export type WebSocketData = {
  sessionId: string
  connectedAt: number
  channel: 'client' | 'sdk' | 'stt'
  sdkToken: string | null
  serverPort: number
  serverHost: string
  imChannel?: string
  sttUpstream?: unknown
  sttConfig?: unknown
}
