/**
 * Usage Statistics API
 *
 * GET /api/usage?days=7&model=Anthropic  — 查询用量汇总
 */
import { queryUsage } from '../services/usageService'
import { errorResponse } from '../middleware/errorHandler'

export async function handleUsageApi(req: Request, _url: URL): Promise<Response> {
  try {
    if (req.method !== 'GET') {
      return errorResponse(405, 'Method not allowed')
    }

    const url = new URL(req.url)
    const daysParam = url.searchParams.get('days') || '7'
    const modelParam = url.searchParams.get('model') || ''
    const days = Math.min(365, Math.max(1, parseInt(daysParam, 10) || 7))
    const model = modelParam.trim()

    const result = await queryUsage(days, model || undefined)

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[usage-api]', err)
    return errorResponse(500, 'Internal error')
  }
}
