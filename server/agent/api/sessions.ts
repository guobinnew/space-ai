/**
 * Session REST API Routes (桩实现)
 *
 * 参照 smart-code src/server/api/sessions.ts 的接口结构。
 * 当前为桩实现，返回空数据。后续可接入实际会话管理逻辑。
 *
 * Routes:
 *   GET    /api/sessions            — 列出会话
 *   GET    /api/sessions/:id        — 获取会话详情
 *   POST   /api/sessions            — 创建新会话
 *   DELETE /api/sessions/:id        — 删除会话
 *   PATCH  /api/sessions/:id        — 重命名会话
 */

import { ApiError, errorResponse } from '../middleware/errorHandler'

export async function handleSessionsApi(
  req: Request,
  _url: URL,
  segments: string[],
): Promise<Response> {
  try {
    const sessionId = segments[2]
    const subResource = segments[3]

    // Collection routes: /api/sessions
    if (!sessionId) {
      switch (req.method) {
        case 'GET':
          return Response.json({ sessions: [], total: 0 })

        case 'POST': {
          let body: { workDir?: string }
          try {
            body = (await req.json()) as typeof body
          } catch {
            throw ApiError.badRequest('Invalid JSON body')
          }
          const id = `session-${Date.now()}`
          return Response.json(
            { id, status: 'running', createdAt: Date.now(), workDir: body.workDir || '' },
            { status: 201 },
          )
        }

        default:
          throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
      }
    }

    // Sub-resource routes
    if (subResource === 'messages' && req.method === 'GET') {
      return Response.json({ messages: [] })
    }

    // Item routes: /api/sessions/:id
    switch (req.method) {
      case 'GET':
        throw ApiError.notFound(`Session not found: ${sessionId}`)

      case 'DELETE':
        return Response.json({ ok: true })

      case 'PATCH':
        return Response.json({ ok: true })

      default:
        throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
    }
  } catch (error) {
    return errorResponse(error)
  }
}
