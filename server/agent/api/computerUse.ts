/**
 * Computer Use API
 *
 * GET  /api/computer-use/status  — check availability
 * POST /api/computer-use/setup    — run setup
 */

import { errorResponse } from '../middleware/errorHandler'

export async function handleComputerUseApi(
  req: Request,
  _url: URL,
  segments: string[],
): Promise<Response> {
  try {
    const action = segments[2]

    if (action === 'status' && req.method === 'GET') {
      const isWindows = process.platform === 'win32'
      const isMac = process.platform === 'darwin'
      return Response.json({
        available: isMac || isWindows,
        platform: process.platform,
        pythonAvailable: false,
        setupCompleted: false,
      })
    }

    if (action === 'setup' && req.method === 'POST') {
      // TODO: implement actual setup (install python deps, etc.)
      return Response.json({ success: false, message: '计算机操作设置功能开发中' })
    }

    return Response.json({ error: 'Not implemented' }, { status: 404 })
  } catch (error) {
    return errorResponse(error)
  }
}
