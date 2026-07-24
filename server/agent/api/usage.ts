/**
 * Usage Statistics API
 *
 * GET /api/usage?days=7&model=Anthropic  — 查询用量汇总
 */
import { queryUsage } from '../services/usageService'

export async function handleUsageApi(req: Request, _url: URL): Promise<Response> {
  try {
    if (req.method !== 'GET') {
      return Response.json({ error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }, { status: 405 })
    }

    const url = new URL(req.url)
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
