/**
 * Tasks API — 任务清单持久化读写
 *
 * GET    /api/tasks/:sessionId     — 加载会话的任务清单
 * DELETE /api/tasks/:sessionId     — 删除会话的任务文件
 */

import { loadTasks, deleteTasks } from '../services/taskService'
import { ApiError } from '../middleware/errorHandler'

export async function handleTasksApi(
  req: Request,
  _url: URL,
  segments: string[],
): Promise<Response> {
  // segments = ['api', 'tasks', ':sessionId']
  const sessionId = segments[2]
  if (!sessionId) {
    throw ApiError.badRequest('Missing sessionId')
  }

  if (req.method === 'GET') {
    const tasks = await loadTasks(sessionId)
    return Response.json({ tasks })
  }

  if (req.method === 'DELETE') {
    await deleteTasks(sessionId)
    return Response.json({ ok: true })
  }

  throw ApiError.methodNotAllowed(`Method ${req.method} not allowed`)
}
