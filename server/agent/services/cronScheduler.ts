/**
 * CronScheduler — 定时任务调度器
 *
 * 架构（参考 smart-code）：
 *   60s tick → cron 匹配 → executeTask()
 *     ├─ 防重入 (runningTasks Map)
 *     ├─ AbortController 超时 (10min)
 *     ├─ streamChat 执行 → onChunk 收集输出
 *     ├─ 结果日志 → scheduled_runs.jsonl
 *     └─ 飞书通知（预留）
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { cronService, type CronTask } from './cronService'
import { sessionService } from './sessionService'
import { streamChat } from './llmStreamService'
import { parseCronExpression, computeNextCronRun } from './cron'

// ─── 配置 ─────────────────────────────────────────────────

const CONFIG_DIR = process.env.SPACEAI_CONFIG_DIR || path.join(os.homedir(), '.spaceai')
const RUNS_FILE = path.join(CONFIG_DIR, 'scheduled_runs.jsonl')
const TICK_INTERVAL_MS = 60_000  // 60s
const EXEC_TIMEOUT_MS = 600_000  // 10min

// ─── 类型 ─────────────────────────────────────────────────

export type RunRecord = {
  id: string
  taskId: string
  taskName?: string
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'aborted'
  startedAt: string
  finishedAt?: string
  durationMs?: number
  sessionId?: string
  output?: string
  error?: string
}

// ─── 状态 ─────────────────────────────────────────────────

let tickTimer: ReturnType<typeof setInterval> | null = null
const runningTasks = new Map<string, AbortController>()

// ─── 启动/停止 ───────────────────────────────────────────

export function startScheduler(): void {
  if (tickTimer) return
  console.log('[CronScheduler] Starting...')
  tickTimer = setInterval(tick, TICK_INTERVAL_MS)
  tick().catch((err) => console.error('[CronScheduler] Initial tick:', err))
}

export function stopScheduler(): void {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
  for (const [, ctrl] of runningTasks) ctrl.abort()
  runningTasks.clear()
  console.log('[CronScheduler] Stopped.')
}

// ─── 主循环 ─────────────────────────────────────────────

async function tick(): Promise<void> {
  try {
    const tasks = await cronService.listTasks()
    const now = new Date()

    for (const task of tasks) {
      if (!task.enabled) continue

      // 防重入
      if (runningTasks.has(task.id)) continue

      // cron 匹配
      const parsed = parseCronExpression(task.cron)
      if (!parsed) continue

      const last = task.lastFiredAt ? new Date(task.lastFiredAt) : new Date(0)
      const next = computeNextCronRun(parsed, last)
      if (!next || next.getTime() > now.getTime()) continue

      // 异步执行（不阻塞 tick）
      executeTask(task).catch((err) => console.error(`[CronScheduler] Task ${task.id} error:`, err))
    }
  } catch (err) {
    console.error('[CronScheduler] Tick error:', err)
  }
}

// ─── 核心执行 ────────────────────────────────────────────

async function executeTask(task: CronTask): Promise<void> {
  const startedAt = new Date()
  const runId = `${task.id}-${Date.now()}`
  const ctrl = new AbortController()
  runningTasks.set(task.id, ctrl)

  await cronService.updateLastFired(task.id, startedAt.toISOString())
  await appendRun({ id: runId, taskId: task.id, taskName: task.name, status: 'running', startedAt: startedAt.toISOString() })

  console.log(`[CronScheduler] Execute: ${task.name || task.id}`)

  // 超时定时器
  const timeout = setTimeout(() => ctrl.abort(), EXEC_TIMEOUT_MS)

  try {
    // 1. 创建会话
    const session = await sessionService.createSession({
      title: `定时: ${task.name || task.id}`,
      workDir: task.folderPath,
    })
    // 2. 写入用户消息（streamChat 依赖历史最后一条为用户消息）
    const msg = `[定时任务] ${task.name || task.id}\n\n${task.prompt}`
    await sessionService.addMessage(session.id, 'user', msg)

    // 3. 执行 LLM 并收集输出
    const outputChunks: string[] = []
    await streamChat(
      session.id,
      msg,
      (chunk) => {
        if (chunk.type === 'content_delta' && chunk.text) {
          outputChunks.push(chunk.text)
        }
      },
      () => ctrl.signal.aborted,
      async () => { throw new Error('定时任务无法交互式提问') },
    )

    clearTimeout(timeout)
    const finishedAt = new Date()
    const output = outputChunks.join('').trim()

    // 检测是否因超时中止
    if (ctrl.signal.aborted) {
      await appendRun({
        id: runId,
        taskId: task.id,
        taskName: task.name,
        status: 'timeout',
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        sessionId: session.id,
        output: output.slice(0, 5000),
        error: `执行超时（${EXEC_TIMEOUT_MS / 1000}s）`,
      })
      console.log(`[CronScheduler] TIMEOUT: ${task.name || task.id} (${EXEC_TIMEOUT_MS / 1000}s)`)
    } else {
      await appendRun({
        id: runId,
        taskId: task.id,
        taskName: task.name,
        status: 'completed',
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        sessionId: session.id,
        output: output.slice(0, 5000),
      })
      console.log(`[CronScheduler] Completed: ${task.name || task.id} (${finishedAt.getTime() - startedAt.getTime()}ms)`)
    }
  } catch (err) {
    clearTimeout(timeout)
    const finishedAt = new Date()
    const error = err instanceof Error ? err.message : String(err)

    await appendRun({
      id: runId,
      taskId: task.id,
      taskName: task.name,
      status: 'failed',
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      error,
    })

    console.error(`[CronScheduler] FAILED: ${task.name || task.id} (${error})`)
  } finally {
    runningTasks.delete(task.id)
  }
}

// ─── 公共接口（API 调用） ────────────────────────────────

/** 立即执行任务（API POST /exec） */
export async function executeTaskById(task: CronTask): Promise<void> {
  return executeTask(task)
}

/** 中止任务 */
export async function abortTask(taskId: string): Promise<boolean> {
  const ctrl = runningTasks.get(taskId)
  if (!ctrl) return false
  ctrl.abort()
  runningTasks.delete(taskId)
  await markRunningAsAborted(taskId)
  return true
}

/** 中止全部运行中任务 */
export async function abortAllRunningTasks(): Promise<number> {
  const count = runningTasks.size
  for (const [id, ctrl] of runningTasks) {
    ctrl.abort()
    runningTasks.delete(id)
  }
  await markAllRunningAsAborted()
  return count
}

/** 获取最近运行记录 */
export async function getRecentRuns(limit = 50): Promise<RunRecord[]> {
  const runs = await readRuns()
  return runs.reverse().slice(0, limit)
}

/** 获取某任务运行记录 */
export async function getTaskRuns(taskId: string): Promise<RunRecord[]> {
  const runs = await readRuns()
  return runs.filter((r) => r.taskId === taskId).reverse()
}

/** 删除某条运行记录 */
export async function deleteRun(runId: string): Promise<boolean> {
  const runs = await readRuns()
  const idx = runs.findIndex((r) => r.id === runId)
  if (idx === -1) return false
  runs.splice(idx, 1)
  await writeRuns(runs)
  return true
}

/** 清空某任务运行记录 */
export async function clearTaskRuns(taskId: string): Promise<number> {
  const runs = await readRuns()
  const kept = runs.filter((r) => r.taskId !== taskId)
  await writeRuns(kept)
  return runs.length - kept.length
}

// ─── 辅助 ────────────────────────────────────────────────

async function markRunningAsAborted(taskId: string): Promise<void> {
  const runs = await readRuns()
  for (const r of runs) {
    if (r.taskId === taskId && r.status === 'running') {
      r.status = 'aborted'
      r.finishedAt = new Date().toISOString()
    }
  }
  await writeRuns(runs)
}

async function markAllRunningAsAborted(): Promise<void> {
  const runs = await readRuns()
  for (const r of runs) {
    if (r.status === 'running') {
      r.status = 'aborted'
      r.finishedAt = new Date().toISOString()
    }
  }
  await writeRuns(runs)
}

// ─── 持久化 ──────────────────────────────────────────────

async function readRuns(): Promise<RunRecord[]> {
  try {
    const raw = await fs.readFile(RUNS_FILE, 'utf-8')
    return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l))
  } catch { return [] }
}

async function writeRuns(runs: RunRecord[]): Promise<void> {
  const dir = path.dirname(RUNS_FILE)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(RUNS_FILE, runs.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8')
}

async function appendRun(run: RunRecord): Promise<void> {
  const dir = path.dirname(RUNS_FILE)
  await fs.mkdir(dir, { recursive: true })
  await fs.appendFile(RUNS_FILE, JSON.stringify(run) + '\n', 'utf-8')
}
