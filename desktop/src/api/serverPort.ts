/**
 * Server Port — 集中管理服务端端口发现
 *
 * 服务端可能因端口冲突回退到 3722-3725，实际端口写入 ~/.spaceai/server.port。
 * 桌面端通过 Tauri 命令 get_server_port 读取该文件。
 */

import { invoke } from '@tauri-apps/api/core'

const DEFAULT_PORT = 3721

let cachedPort: number | null = null

/**
 * 从 Tauri 后端获取服务端实际端口（读取 ~/.spaceai/server.port，回退 3721）。
 * 结果会缓存，后续调用直接返回缓存值。
 */
export async function getServerPort(): Promise<number> {
  if (cachedPort !== null) return cachedPort
  try {
    cachedPort = await invoke<number>('get_server_port')
    if (!cachedPort || cachedPort <= 0) cachedPort = DEFAULT_PORT
  } catch {
    cachedPort = DEFAULT_PORT
  }
  return cachedPort
}

/**
 * 重新读取端口（清除缓存）。
 * 在健康检查失败时调用，以处理服务端还在启动中的情况。
 */
export async function refreshServerPort(): Promise<number> {
  cachedPort = null
  return getServerPort()
}

/** 获取当前缓存端口（同步，未初始化时返回默认值 3721）。 */
export function getCachedServerPort(): number {
  return cachedPort ?? DEFAULT_PORT
}

/** 获取服务端 Base URL（异步，确保端口已初始化）。 */
export async function getServerBaseUrl(): Promise<string> {
  const port = await getServerPort()
  return `http://127.0.0.1:${port}`
}

/** 获取服务端 Base URL（同步，使用缓存端口，未初始化时返回默认值）。 */
export function getCachedServerBaseUrl(): string {
  return `http://127.0.0.1:${getCachedServerPort()}`
}
