/**
 * Scheduled Tasks API
 *
 * GET    /api/scheduled-tasks           — 列出所有任务
 * POST   /api/scheduled-tasks           — 创建新任务
 * PUT    /api/scheduled-tasks/:id        — 更新任务
 * DELETE /api/scheduled-tasks/:id        — 删除任务
 * POST   /api/scheduled-tasks/:id/exec   — 立即执行
 * POST   /api/scheduled-tasks/:id/abort  — 中止执行
 * GET    /api/scheduled-tasks/runs       — 获取运行记录
 * GET    /api/scheduled-tasks/:id/runs   — 获取某任务的运行记录
 * DELETE /api/scheduled-tasks/runs/:runId — 删除某条运行记录
 */
import { cronService } from '../services/cronService'
import { executeTask, abortTask, getRecentRuns, getTaskRuns, deleteRun, clearTaskRuns } from '../services/cronScheduler'

export async function handleScheduledTasksApi(req: Request, url: URL): Promise<Response> {
  try {
    const path = url.pathname.replace(/\/+$/, '')
    const method = req.method

    // ── Runs ─────────────────────────────────
    if (path === '/api/scheduled-tasks/runs' && method === 'GET') {
      const limitParam = url.searchParams.get('limit') || '50'
      const limit = Math.min(200, Math.max(1, parseInt(limitParam, 10) || 50))
      const runs = await getRecentRuns(limit)
      return Response.json({ runs })
    }

    // 删除运行记录 /api/scheduled-tasks/runs/:runId
    const runsDeleteMatch = path.match(/^\/api\/scheduled-tasks\/runs\/([^/]+)$/)
    if (runsDeleteMatch && method === 'DELETE') {
      const deleted = await deleteRun(runsDeleteMatch[1]!)
      if (!deleted) return Response.json({ error: 'NOT_FOUND', message: 'Run not found' }, { status: 404 })
      return Response.json({ success: true })
    }

    // ── Task specific ────────────────────────
    const taskMatch = path.match(/^\/api\/scheduled-tasks\/([^/]+?)(?:\/(.+))?$/)
    if (taskMatch) {
      const taskId = taskMatch[1]!
      const action = taskMatch[2]  // undefined, 'exec', 'abort', or 'runs'

      if (action === 'runs' && method === 'GET') {
        const runs = await getTaskRuns(taskId)
        return Response.json({ runs })
      }

      if (action === 'runs' && method === 'DELETE') {
        const count = await clearTaskRuns(taskId)
        return Response.json({ deleted: count })
      }

      if (action === 'exec' && method === 'POST') {
        const tasks = await cronService.listTasks()
        const task = tasks.find((t) => t.id === taskId)
        if (!task) return Response.json({ error: 'NOT_FOUND' }, { status: 404 })
        // 异步执行，不等待完成
        executeTask(task).catch((err) => console.error('[ScheduledTasks] exec error:', err))
        return Response.json({ success: true, message: 'Task execution started' })
      }

      if (action === 'abort' && method === 'POST') {
        const aborted = await abortTask(taskId)
        return Response.json({ aborted })
      }

      if (!action) {
        // PUT /api/scheduled-tasks/:id — 更新
        if (method === 'PUT') {
          const body = await req.json() as Record<string, unknown>
          const updated = await cronService.updateTask(taskId, body)
          return Response.json(updated)
        }
        // DELETE /api/scheduled-tasks/:id — 删除
        if (method === 'DELETE') {
          await cronService.deleteTask(taskId)
          return Response.json({ success: true })
        }
        // GET /api/scheduled-tasks/:id — 单个任务
        if (method === 'GET') {
          const tasks = await cronService.listTasks()
          const task = tasks.find((t) => t.id === taskId)
          if (!task) return Response.json({ error: 'NOT_FOUND' }, { status: 404 })
          return Response.json(task)
        }
      }
    }

    // ── Collection ───────────────────────────
    if (path === '/api/scheduled-tasks' || path === '/api/scheduled-tasks/') {
      if (method === 'GET') {
        const tasks = await cronService.listTasks()
        return Response.json({ tasks })
      }
      if (method === 'POST') {
        const body = await req.json() as Record<string, unknown>
        const task = await cronService.createTask({
          name: body.name as string | undefined,
          description: body.description as string | undefined,
          cron: body.cron as string,
          prompt: body.prompt as string,
          folderPath: body.folderPath as string | undefined,
        })
        return Response.json(task, { status: 201 })
      }
    }

    return Response.json({ error: 'NOT_FOUND', message: `No route: ${method} ${path}` }, { status: 404 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: 'INTERNAL_ERROR', message: msg }, { status: 500 })
  }
}
