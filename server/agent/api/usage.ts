/**
 * Usage Statistics API
 *
 * GET  /api/usage?days=7&model=Anthropic  — 查询用量汇总
 * POST /api/usage/cleanup                — 清理服务商为空的旧记录
 */
import { queryUsage, cleanupEmptyProvider } from '../services/usageService'

export async function handleUsageApi(req: Request, url: URL): Promise<Response> {
  try {
    const path = url.pathname

    // POST /api/usage/cleanup
    if (req.method === 'POST' && path.endsWith('/cleanup')) {
      const removed = await cleanupEmptyProvider()
      return Response.json({ removed, message: `已清理 ${removed} 条服务商为空的记录` })
    }

    if (req.method !== 'GET') {
      return Response.json({ error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }, { status: 405 })
    }

    const daysParam = url.searchParams.get('days') || '7'
    const modelParam = url.searchParams.get('model') || ''
    const days = Math.min(365, Math.max(1, parseInt(daysParam, 10) || 7))
    const model = modelParam.trim()

    const result = await queryUsage(days, model || undefined)

    return Response.json(result)
  } catch (err) {
    console.error('[usage-api]', err)
    return Response.json({ error: 'INTERNAL_ERROR', message: String(err) }, { status: 500 })
  }
}
