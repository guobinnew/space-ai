/**
 * Computer Use API
 *
 * GET  /api/computer-use/status           — 检测 Python + venv + 依赖 + 权限状态
 * POST /api/computer-use/setup            — 创建 venv + 安装依赖
 * GET  /api/computer-use/apps             — 列出系统已安装应用
 * GET  /api/computer-use/authorized-apps  — 获取授权应用配置
 * PUT  /api/computer-use/authorized-apps  — 更新授权应用配置
 * POST /api/computer-use/open-settings    — 打开系统设置
 */
import {
  getStatus,
  runSetup,
  listInstalledApps,
  loadConfig,
  saveConfig,
  openSystemSettings,
  type ComputerUseConfig,
} from '../services/computerUseService'

export async function handleComputerUseApi(req: Request, url: URL, segments: string[]): Promise<Response> {
  const action = segments[2] || ''

  try {
    // GET /api/computer-use/status
    if (action === 'status' && req.method === 'GET') {
      const status = await getStatus()
      return Response.json(status)
    }

    // POST /api/computer-use/setup
    if (action === 'setup' && req.method === 'POST') {
      const result = await runSetup()
      return Response.json(result, { status: result.success ? 200 : 500 })
    }

    // GET /api/computer-use/apps — list installed apps
    if (action === 'apps' && req.method === 'GET') {
      const apps = await listInstalledApps()
      return Response.json({ apps })
    }

    // GET /api/computer-use/authorized-apps — current authorized config
    if (action === 'authorized-apps' && req.method === 'GET') {
      const config = await loadConfig()
      return Response.json(config)
    }

    // PUT /api/computer-use/authorized-apps — update authorized config
    if (action === 'authorized-apps' && req.method === 'PUT') {
      try {
        const body = (await req.json()) as Partial<ComputerUseConfig>
        const config = await loadConfig()
        if (body.authorizedApps) config.authorizedApps = body.authorizedApps
        if (body.grantFlags) config.grantFlags = { ...config.grantFlags, ...body.grantFlags }
        await saveConfig(config)
        return Response.json({ ok: true })
      } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 })
      }
    }

    // POST /api/computer-use/open-settings — open system settings pane
    if (action === 'open-settings' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { pane?: string }
      const pane = body.pane ?? 'Privacy_ScreenCapture'
      await openSystemSettings(pane)
      return Response.json({ ok: true })
    }

    return Response.json({ error: 'NOT_FOUND', message: `No route: ${req.method} ${url.pathname}` }, { status: 404 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: 'INTERNAL_ERROR', message: msg }, { status: 500 })
  }
}
