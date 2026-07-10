/**
 * Task Service — 任务持久化服务
 *
 * LLM 通过 TodoWrite 工具产生的任务清单持久化到磁盘：
 *   ~/.spaceai/tasks/<sessionId>.json
 *
 * 每个会话一个 JSON 文件，格式为 TodoItem[]（与 TodoWriteTool 一致）。
 */

import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import * as os from 'os'

const CONFIG_DIR = process.env.SPACEAI_CONFIG_DIR || path.join(os.homedir(), '.spaceai')

interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string
}

function getTasksDir(): string {
  return path.join(CONFIG_DIR, 'tasks')
}

function getTaskPath(sessionId: string): string {
  return path.join(getTasksDir(), `${sessionId}.json`)
}

/** 保存会话的任务清单到磁盘 */
export async function saveTasks(sessionId: string, todos: TodoItem[]): Promise<void> {
  const dir = getTasksDir()
  if (!fsSync.existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true })
  }
  await fs.writeFile(getTaskPath(sessionId), JSON.stringify(todos, null, 2), 'utf-8')
}

/** 从磁盘加载会话的任务清单 */
export async function loadTasks(sessionId: string): Promise<TodoItem[]> {
  try {
    const data = await fs.readFile(getTaskPath(sessionId), 'utf-8')
    return JSON.parse(data) as TodoItem[]
  } catch {
    return []
  }
}

/** 删除会话的任务文件 */
export async function deleteTasks(sessionId: string): Promise<void> {
  try {
    await fs.unlink(getTaskPath(sessionId))
  } catch {
    // File may not exist, ignore
  }
}
