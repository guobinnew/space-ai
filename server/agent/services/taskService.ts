/**
 * Task Service — 任务持久化服务（完整版）
 *
 * 参照 smart-code src/utils/tasks.ts 的设计思路。
 *
 * Storage:
 *   ~/.spaceai/tasks/<taskListId>/
 *     .highwatermark           — ID 自增水位线
 *     <taskId>.json            — 单个任务文件
 *
 * taskListId 使用 sessionId。
 */

import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { Task, CreateTaskInput, UpdateTaskInput, TaskStatus, TaskPriority } from '../types/task'

const CONFIG_DIR = process.env.SPACEAI_CONFIG_DIR || path.join(os.homedir(), '.spaceai')

function getTasksBaseDir(): string {
  return path.join(CONFIG_DIR, 'tasks')
}

function getTaskListDir(taskListId: string): string {
  return path.join(getTasksBaseDir(), taskListId)
}

function getTaskPath(taskListId: string, taskId: string): string {
  return path.join(getTaskListDir(taskListId), `${taskId}.json`)
}

function getHighwatermarkPath(taskListId: string): string {
  return path.join(getTaskListDir(taskListId), '.highwatermark')
}

async function ensureDir(dir: string): Promise<void> {
  if (!fsSync.existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true })
  }
}

/** 读取高水位线（下一个可用的 ID） */
async function readHighwatermark(taskListId: string): Promise<number> {
  try {
    const data = await fs.readFile(getHighwatermarkPath(taskListId), 'utf-8')
    return Number.parseInt(data.trim(), 10) || 0
  } catch {
    return 0
  }
}

/** 写入高水位线 */
async function writeHighwatermark(taskListId: string, value: number): Promise<void> {
  await ensureDir(getTaskListDir(taskListId))
  await fs.writeFile(getHighwatermarkPath(taskListId), String(value), 'utf-8')
}

/** 分配一个新的任务 ID */
async function allocateId(taskListId: string): Promise<string> {
  const hw = await readHighwatermark(taskListId)
  const nextId = hw + 1
  await writeHighwatermark(taskListId, nextId)
  return String(nextId)
}

/** 创建任务 */
export async function createTask(taskListId: string, input: CreateTaskInput, createdBy: string = 'agent'): Promise<Task> {
  await ensureDir(getTaskListDir(taskListId))
  const id = await allocateId(taskListId)
  const now = new Date().toISOString()
  const task: Task = {
    id,
    subject: input.subject,
    body: input.body,
    status: 'pending',
    owner: input.owner || createdBy,
    createdBy,
    createdAt: now,
    updatedAt: now,
    tags: input.tags || [],
    priority: input.priority || 'medium',
  }
  await fs.writeFile(getTaskPath(taskListId, id), JSON.stringify(task, null, 2), 'utf-8')
  return task
}

/** 更新任务 */
export async function updateTask(taskListId: string, taskId: string, input: UpdateTaskInput): Promise<Task | null> {
  const taskPath = getTaskPath(taskListId, taskId)
  try {
    const raw = await fs.readFile(taskPath, 'utf-8')
    const task = JSON.parse(raw) as Task
    const now = new Date().toISOString()
    if (input.subject !== undefined) task.subject = input.subject
    if (input.body !== undefined) task.body = input.body
    if (input.status !== undefined) {
      task.status = input.status
      if (input.status === 'completed' || input.status === 'failed' || input.status === 'cancelled') {
        task.completedAt = task.completedAt || now
      }
    }
    if (input.owner !== undefined) task.owner = input.owner
    if (input.priority !== undefined) task.priority = input.priority
    if (input.tags !== undefined) task.tags = input.tags
    if (input.cost !== undefined) task.cost = input.cost
    task.updatedAt = now
    await fs.writeFile(taskPath, JSON.stringify(task, null, 2), 'utf-8')
    return task
  } catch {
    return null
  }
}

/** 获取单个任务 */
export async function getTask(taskListId: string, taskId: string): Promise<Task | null> {
  try {
    const raw = await fs.readFile(getTaskPath(taskListId, taskId), 'utf-8')
    return JSON.parse(raw) as Task
  } catch {
    return null
  }
}

/** 获取任务列表（按 updatedAt 降序） */
export async function listTasks(taskListId: string): Promise<Task[]> {
  const dir = getTaskListDir(taskListId)
  try {
    const files = await fs.readdir(dir)
    const tasks: Task[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await fs.readFile(path.join(dir, file), 'utf-8')
        tasks.push(JSON.parse(raw) as Task)
      } catch {
        // Skip malformed files
      }
    }
    tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return tasks
  } catch {
    return []
  }
}

/** 删除单个任务 */
export async function deleteTask(taskListId: string, taskId: string): Promise<boolean> {
  try {
    await fs.unlink(getTaskPath(taskListId, taskId))
    return true
  } catch {
    return false
  }
}

/** 重置任务列表（清除所有任务，保存高水位线） */
export async function resetTaskList(taskListId: string): Promise<void> {
  const dir = getTaskListDir(taskListId)
  try {
    // Save highwatermark first
    const hw = await readHighwatermark(taskListId)
    // Delete all .json files
    const files = await fs.readdir(dir)
    for (const file of files) {
      if (file.endsWith('.json')) {
        try { await fs.unlink(path.join(dir, file)) } catch { /* ignore */ }
      }
    }
    // Restore highwatermark (so IDs don't repeat)
    await writeHighwatermark(taskListId, hw)
  } catch {
    // Directory may not exist
  }
}

/** 检查是否有 pending 或 in_progress 的任务 */
export async function hasPendingTasks(taskListId: string): Promise<boolean> {
  const tasks = await listTasks(taskListId)
  return tasks.some((t) => t.status === 'pending' || t.status === 'in_progress')
}

/** 获取下一个 pending 任务 */
export async function getNextPendingTask(taskListId: string): Promise<Task | null> {
  const tasks = await listTasks(taskListId)
  const pending = tasks
    .filter((t) => t.status === 'pending')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return pending[0] || null
}

// ── 向后兼容：旧的 TodoItem 单文件格式 ──────────────────────

interface LegacyTodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string
}

function getLegacyPath(sessionId: string): string {
  return path.join(getTasksBaseDir(), `${sessionId}.json`)
}

/** 保存旧格式 todo 列表（TodoWriteTool 使用） */
export async function saveTasks(sessionId: string, todos: LegacyTodoItem[]): Promise<void> {
  const dir = getTasksBaseDir()
  if (!fsSync.existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true })
  }
  await fs.writeFile(getLegacyPath(sessionId), JSON.stringify(todos, null, 2), 'utf-8')
}

/** 加载旧格式 todo 列表 */
export async function loadTasks(sessionId: string): Promise<LegacyTodoItem[]> {
  try {
    const data = await fs.readFile(getLegacyPath(sessionId), 'utf-8')
    return JSON.parse(data) as LegacyTodoItem[]
  } catch {
    return []
  }
}

/** 删除旧格式 todo 文件 */
export async function deleteTasks(sessionId: string): Promise<void> {
  try {
    await fs.unlink(getLegacyPath(sessionId))
  } catch {
    // File may not exist, ignore
  }
}
