/**
 * Smart Space Sidecar — 统一子进程入口
 *
 * 参照 smart-code desktop/sidecars/smart-sidecar.ts 复刻。
 * desktop 通过 Tauri sidecar 或 bun 进程启动此文件，
 * 第一个 positional 参数选择模式：
 *
 *   smart-sidecar server --app-root <path> --host 127.0.0.1 --port 3721
 *
 * 调用方通过第一个参数选择模式，--app-root 等 launcher 参数
 * 在进入 server 模块前被 splice 掉。
 */

const rawArgs = process.argv.slice(2)
if (rawArgs.length === 0) {
  console.error('smart-sidecar: missing mode argument (expected "server")')
  process.exit(2)
}

const mode = rawArgs[0]!
const restArgs = rawArgs.slice(1)

if (mode === 'server') {
  const { appRoot, args } = parseLauncherArgs(restArgs)

  process.env.SPACEAI_APP_ROOT = appRoot
  process.env.CALLER_DIR ||= process.cwd()
  process.argv = [process.argv[0]!, process.argv[1]!, ...args]

  const { startServer } = await import('./index.ts')
  await startServer()
} else {
  console.error(`smart-sidecar: unknown mode "${mode}" (expected "server")`)
  process.exit(2)
}

function parseLauncherArgs(rawArgs: string[]): { appRoot: string; args: string[] } {
  const nextArgs: string[] = []
  let appRoot: string | null = process.env.SPACEAI_APP_ROOT ?? null

  for (let index = 0; index < rawArgs.length; index++) {
    const arg = rawArgs[index]
    if (arg === '--app-root') {
      appRoot = rawArgs[index + 1] ?? null
      index += 1
      continue
    }
    nextArgs.push(arg!)
  }

  if (!appRoot) {
    // Fall back to current working directory
    appRoot = process.cwd()
  }

  return { appRoot, args: nextArgs }
}
