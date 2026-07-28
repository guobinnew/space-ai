/**
 * CronService — 管理定时任务的增删改查
 *
 * 任务持久化到 ~/.spaceai/scheduled_tasks.json
 * 格式: { "tasks": [ CronTask, ... ] }
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { parseCronExpression, cronToHuman } from './cron'

// ─── 类型定义 ─────────────────────────────────────────────

export type CronTask = {
  id: string
  name?: string
  description?: string
  cron: string       // 5-field cron expression
  prompt: string
  folderPath?: string  // 执行工作目录
  sessionId?: string   // 持久会话 ID（复用同一会话）
  createdAt: number  // epoch ms
  lastFiredAt?: string  // ISO timestamp
  enabled?: boolean
}

type TasksFile = {
  tasks: CronTask[]
}

// ─── 配置 ─────────────────────────────────────────────────

const CONFIG_DIR = process.env.SPACEAI_CONFIG_DIR || path.join(os.homedir(), '.spaceai')
const TASKS_FILE = path.join(CONFIG_DIR, 'scheduled_tasks.json')

// ─── Service ──────────────────────────────────────────────

export class CronService {
  /** 获取所有任务 */
  async listTasks(): Promise<CronTask[]> {
    const data = await this.readTasksFile()
    return data.tasks
  }

  /** 创建新任务 */
  async createTask(fields: {
    name?: string
    description?: string
    cron: string
    prompt: string
    folderPath?: string
  }): Promise<CronTask> {
    if (!fields.cron || !fields.prompt) {
      throw new Error('Fields "cron" and "prompt" are required')
    }

    // 验证 cron 表达式
    const parsed = parseCronExpression(fields.cron)
    if (!parsed) {
      throw new Error(`Invalid cron expression: ${fields.cron}`)
    }

    const data = await this.readTasksFile()
    const task: CronTask = {
      id: crypto.randomBytes(4).toString('hex'),
      name: fields.name,
      description: fields.description,
      cron: fields.cron,
      prompt: fields.prompt,
      folderPath: fields.folderPath,
      createdAt: Date.now(),
      lastFiredAt: new Date().toISOString(), // 防止创建后立即执行
      enabled: true,
    }
    data.tasks.push(task)
    await this.writeTasksFile(data)
    return task
  }

  /** 更新任务 */
  async updateTask(id: string, updates: Partial<CronTask>): Promise<CronTask> {
    const data = await this.readTasksFile()
    const index = data.tasks.findIndex((t) => t.id === id)
    if (index === -1) {
      throw new Error(`Task not found: ${id}`)
    }

    const { id: _id, createdAt: _ca, ...safe } = updates
    data.tasks[index] = { ...data.tasks[index], ...safe }
    await this.writeTasksFile(data)
    return data.tasks[index]
  }

  /** 删除任务 */
  async deleteTask(id: string): Promise<void> {
    const data = await this.readTasksFile()
    const index = data.tasks.findIndex((t) => t.id === id)
    if (index === -1) {
      throw new Error(`Task not found: ${id}`)
    }
    data.tasks.splice(index, 1)
    await this.writeTasksFile(data)
  }

  /** 更新最后执行时间 */
  async updateLastFired(taskId: string, timestamp: string): Promise<void> {
    const data = await this.readTasksFile()
    const index = data.tasks.findIndex((t) => t.id === taskId)
    if (index === -1) return
    data.tasks[index].lastFiredAt = timestamp
    await this.writeTasksFile(data)
  }

  /** 获取 cron 人类可读描述 */
  describe(cron: string): string {
    return cronToHuman(cron)
  }

  // ─── 文件读写 ───────────────────────────────────────

  private async readTasksFile(): Promise<TasksFile> {
    try {
      const raw = await fs.readFile(TASKS_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed.tasks)) return { tasks: [] }
      return parsed
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { tasks: [] }
      }
      throw err
    }
  }

  private async writeTasksFile(data: TasksFile): Promise<void> {
    const dir = path.dirname(TASKS_FILE)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(TASKS_FILE, JSON.stringify(data, null, 2), 'utf-8')
  }
}

export const cronService = new CronService()
