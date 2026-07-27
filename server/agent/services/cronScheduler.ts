/**
 * CronScheduler — 定时任务调度执行引擎
 *
 * 每 60 秒 tick 一次，检查所有已启用的任务，匹配 cron 表达式后触发。
 * 执行记录持久化到 ~/.spaceai/scheduled_runs.jsonl
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { cronService, type CronTask } from './cronService'
import { sessionService } from './sessionService'
import { parseCronExpression, computeNextCronRun } from './cron'
import { streamChat } from './llmStreamService'

// ─── 配置 ─────────────────────────────────────────────────

const CONFIG_DIR = process.env.SPACEAI_CONFIG_DIR || path.join(os.homedir(), '.spaceai')
const RUNS_FILE = path.join(CONFIG_DIR, 'scheduled_runs.jsonl')
const TICK_INTERVAL_MS = 60_000

// ─── 类型 ─────────────────────────────────────────────────

export type RunRecord = {
  id: string
  taskId: string
  taskName?: string
  status: 'running' | 'completed' | 'failed' | 'aborted'
  startedAt: string
  finishedAt?: string
  sessionId?: string
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
}

// ─── 主循环 ─────────────────────────────────────────────

async function tick(): Promise<void> {
  try {
    const tasks = await cronService.listTasks()
    const now = new Date()
    for (const task of tasks) {
      if (!task.enabled) continue
      if (task.lastFiredAt) {
        const parsed = parseCronExpression(task.cron)
        if (!parsed) continue
        const last = new Date(task.lastFiredAt)
        const next = computeNextCronRun(parsed, last)
        if (!next || next.getTime() > now.getTime()) continue
      }
      await fireTask(task, now)
    }
  } catch (err) {
    console.error('[CronScheduler] Tick error:', err)
  }
}

// ─── 执行任务 ────────────────────────────────────────────

async function fireTask(task: CronTask, now: Date): Promise<void> {
  if (runningTasks.has(task.id)) return

  const startedAt = now.toISOString()
  const runId = `${task.id}-${Date.now()}`

  await cronService.updateLastFired(task.id, startedAt)
  await appendRun({ id: runId, taskId: task.id, taskName: task.name, status: 'running', startedAt })

  console.log(`[CronScheduler] Fire: ${task.name || task.id}`)
  runningTasks.set(task.id, new AbortController())

  try {
    // 创建会话并添加用户消息（streamChat 依赖历史中的最后一条为用户消息）
    const session = await sessionService.createSession({
      title: `定时: ${task.name || task.id}`,
      workDir: task.folderPath,
    })
    const msg = `[定时任务] ${task.name || task.id}\n\n${task.prompt}`
    await sessionService.addMessage(session.id, 'user', msg)

    // 实际触发 LLM 执行（无输出回调，无交互）
    const ctrl = runningTasks.get(task.id)!
    await streamChat(
      session.id,
      msg,
      () => {}, // onChunk — 丢弃输出
      () => ctrl.signal.aborted, // isCancelled
      async () => { throw new Error('定时任务无法交互式提问') }, // askUser
    )

    await appendRun({ id: runId, taskId: task.id, taskName: task.name, status: 'completed', startedAt, finishedAt: new Date().toISOString(), sessionId: session.id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await appendRun({ id: runId, taskId: task.id, taskName: task.name, status: 'failed', startedAt, finishedAt: new Date().toISOString(), error: msg })
    console.error(`[CronScheduler] Task ${task.id} failed:`, msg)
  } finally {
    runningTasks.delete(task.id)
  }
}

// ─── 公共接口（API 调用） ────────────────────────────────

export async function executeTask(task: CronTask): Promise<void> {
  await fireTask(task, new Date())
}

export async function abortTask(taskId: string): Promise<boolean> {
  const ctrl = runningTasks.get(taskId)
  if (!ctrl) return false
  ctrl.abort()
  runningTasks.delete(taskId)
  const runs = await readRuns()
  for (const r of runs) {
    if (r.taskId === taskId && r.status === 'running') {
      r.status = 'aborted'
      r.finishedAt = new Date().toISOString()
    }
  }
  await writeRuns(runs)
  return true
}

export async function abortAllRunningTasks(): Promise<number> {
  const count = runningTasks.size
  for (const [, ctrl] of runningTasks) ctrl.abort()
  runningTasks.clear()
  const runs = await readRuns()
  for (const r of runs) {
    if (r.status === 'running') {
      r.status = 'aborted'
      r.finishedAt = new Date().toISOString()
    }
  }
  await writeRuns(runs)
  return count
}

export async function getRecentRuns(limit = 50): Promise<RunRecord[]> {
  const runs = await readRuns()
  return runs.reverse().slice(0, limit)
}

export async function getTaskRuns(taskId: string): Promise<RunRecord[]> {
  const runs = await readRuns()
  return runs.filter((r) => r.taskId === taskId).reverse()
}

export async function clearTaskRuns(taskId: string): Promise<number> {
  const runs = await readRuns()
  const kept = runs.filter((r) => r.taskId !== taskId)
  await writeRuns(kept)
  return runs.length - kept.length
}

export async function deleteRun(runId: string): Promise<boolean> {
  const runs = await readRuns()
  const idx = runs.findIndex((r) => r.id === runId)
  if (idx === -1) return false
  runs.splice(idx, 1)
  await writeRuns(runs)
  return true
}

// ─── 运行记录持久化 ─────────────────────────────────────

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
