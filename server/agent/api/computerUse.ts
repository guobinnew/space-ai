/**
 * Computer Use API
 *
 * GET  /api/computer-use/status  — 检测 Python + venv + 依赖状态
 * POST /api/computer-use/setup   — 创建 venv + 安装依赖
 */
import { getStatus, runSetup } from '../services/computerUseService'

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

    return Response.json({ error: 'NOT_FOUND', message: `No route: ${req.method} ${url.pathname}` }, { status: 404 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: 'INTERNAL_ERROR', message: msg }, { status: 500 })
  }
}
