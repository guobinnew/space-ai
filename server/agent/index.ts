/**
 * Smart Lab Agent Server — Entry Point
 *
 * 参照 smart-code src/server/index.ts 复刻。
 * 导出 startServer 供 sidecar 调用；直接运行时自动启动。
 */

export { startServer } from './server'

// Direct execution (bun run agent/index.ts)
if (import.meta.main) {
  const { startServer } = await import('./server')
  await startServer()
}
