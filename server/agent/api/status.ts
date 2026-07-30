/**
 * Status REST API
 *
 * 参照 smart-code src/server/api/status.ts 复刻。
 *
 * GET /api/status              — 健康检查
 * GET /api/status/diagnostics  — 系统诊断信息
 */

import * as os from 'os'
import * as path from 'path'
import { ApiError, errorResponse } from '../middleware/errorHandler'

const startedAt = Date.now()

export async function handleStatusApi(
  req: Request,
  _url: URL,
  segments: string[],
): Promise<Response> {
  try {
    if (req.method !== 'GET') {
      throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
    }

    const sub = segments[2]

    switch (sub) {
      case undefined:
        return handleHealthCheck()

      case 'diagnostics':
        return handleDiagnostics()

      default:
        throw ApiError.notFound(`Unknown status endpoint: ${sub}`)
    }
  } catch (error) {
    return errorResponse(error)
  }
}

function handleHealthCheck(): Response {
  return Response.json({
    status: 'ok',
    version: process.env.APP_VERSION || '0.1.0',
    uptime: Date.now() - startedAt,
  })
}

function handleDiagnostics(): Response {
  return Response.json({
    nodeVersion: process.version,
    bunVersion: typeof Bun !== 'undefined' ? Bun.version : 'N/A',
    platform: process.platform,
    arch: process.arch,
    memory: {
      rss: process.memoryUsage().rss,
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
    },
  })
}
