/**
 * Tasks API — 任务清单持久化 REST API
 *
 * GET    /api/tasks/:sessionId              — 列出所有任务
 * POST   /api/tasks/:sessionId              — 创建任务
 * DELETE /api/tasks/:sessionId              — 重置任务列表（清除已完成）
 * GET    /api/tasks/:sessionId/:taskId      — 获取单个任务
 * PATCH  /api/tasks/:sessionId/:taskId      — 更新任务
 * DELETE /api/tasks/:sessionId/:taskId      — 删除单个任务
 */

import { listTasks, createTask, getTask, updateTask, deleteTask, resetTaskList, hasPendingTasks, getNextPendingTask } from '../services/taskService'
import { ApiError } from '../middleware/errorHandler'

export async function handleTasksApi(
  req: Request,
  _url: URL,
  segments: string[],
): Promise<Response> {
  // segments = ['api', 'tasks', ':sessionId', ':taskId?']
  const sessionId = segments[2]
  if (!sessionId) throw ApiError.badRequest('Missing sessionId')

  const taskId = segments[3]

  // /api/tasks/:sessionId
  if (!taskId) {
    if (req.method === 'GET') {
      const tasks = await listTasks(sessionId)
      const hasPending = await hasPendingTasks(sessionId)
      const nextPending = await getNextPendingTask(sessionId)
      return Response.json({ tasks, hasPending, nextPending })
    }
    if (req.method === 'POST') {
      const body = await req.json()
      const task = await createTask(sessionId, {
        subject: body.subject,
        body: body.body,
        priority: body.priority,
        tags: body.tags,
      })
      return Response.json({ task }, { status: 201 })
    }
    if (req.method === 'DELETE') {
      await resetTaskList(sessionId)
      return Response.json({ ok: true })
    }
    throw ApiError.methodNotAllowed()
  }

  // /api/tasks/:sessionId/:taskId
  if (req.method === 'GET') {
    const task = await getTask(sessionId, taskId)
    if (!task) throw ApiError.notFound(`Task ${taskId} not found`)
    return Response.json({ task })
  }
  if (req.method === 'PATCH') {
    const body = await req.json()
    const task = await updateTask(sessionId, taskId, body)
    if (!task) throw ApiError.notFound(`Task ${taskId} not found`)
    return Response.json({ task })
  }
  if (req.method === 'DELETE') {
    await deleteTask(sessionId, taskId)
    return Response.json({ ok: true })
  }

  throw ApiError.methodNotAllowed()
}
