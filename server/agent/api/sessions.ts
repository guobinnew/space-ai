/**
 * Sessions REST API
 *
 * 参照 smart-code api/sessions.ts 复刻。
 *
 * GET    /api/sessions            — 列出会话
 * GET    /api/sessions/:id        — 获取会话详情(含消息)
 * GET    /api/sessions/:id/messages — 获取会话消息
 * POST   /api/sessions            — 创建新会话
 * DELETE /api/sessions/:id        — 删除会话
 * PATCH  /api/sessions/:id        — 重命名会话
 * POST   /api/sessions/:id/messages — 添加消息
 */

import { sessionService } from '../services/sessionService'
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
          return await listSessions()

        case 'POST':
          return await createSession(req)

        default:
          throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
      }
    }

    // Sub-resource: /api/sessions/:id/messages
    if (subResource === 'messages') {
      if (req.method === 'GET') {
        return await getSessionMessages(sessionId)
      }
      if (req.method === 'POST') {
        return await addMessage(req, sessionId)
      }
      throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
    }

    // Item routes: /api/sessions/:id
    switch (req.method) {
      case 'GET':
        return await getSession(sessionId)

      case 'DELETE':
        return await deleteSession(sessionId)

      case 'PATCH':
        return await patchSession(req, sessionId)

      default:
        throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
    }
  } catch (error) {
    return errorResponse(error)
  }
}

async function listSessions(): Promise<Response> {
  const result = await sessionService.listSessions()
  return Response.json(result)
}

async function getSession(sessionId: string): Promise<Response> {
  const session = await sessionService.getSession(sessionId)
  return Response.json(session)
}

async function getSessionMessages(sessionId: string): Promise<Response> {
  const messages = await sessionService.getMessages(sessionId)
  return Response.json({ messages })
}

async function createSession(req: Request): Promise<Response> {
  let body: { workDir?: string; title?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }

  const session = await sessionService.createSession({
    workDir: body.workDir,
    title: body.title,
  })
  return Response.json(session, { status: 201 })
}

async function deleteSession(sessionId: string): Promise<Response> {
  await sessionService.deleteSession(sessionId)
  return Response.json({ ok: true })
}

async function patchSession(req: Request, sessionId: string): Promise<Response> {
  let body: { title?: string; workDir?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }

  if (body.title !== undefined && typeof body.title === 'string' && body.title.trim()) {
    await sessionService.renameSession(sessionId, body.title)
  }

  if (body.workDir !== undefined && typeof body.workDir === 'string') {
    await sessionService.updateWorkDir(sessionId, body.workDir)
  }

  if (body.title === undefined && body.workDir === undefined) {
    throw ApiError.badRequest('title or workDir is required')
  }

  return Response.json({ ok: true })
}

async function addMessage(req: Request, sessionId: string): Promise<Response> {
  let body: { role?: string; content?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }

  if (!body.role || (body.role !== 'user' && body.role !== 'assistant')) {
    throw ApiError.badRequest('role must be "user" or "assistant"')
  }
  if (!body.content || typeof body.content !== 'string') {
    throw ApiError.badRequest('content is required')
  }

  const message = await sessionService.addMessage(sessionId, body.role as 'user' | 'assistant', body.content)
  return Response.json({ message }, { status: 201 })
}
