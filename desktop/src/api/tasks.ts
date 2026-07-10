/**
 * Tasks API — 任务持久化完整 CRUD 客户端
 */

import type { Task } from '../types/task'

const BASE_URL = 'http://127.0.0.1:3721'

type TaskListResponse = {
  tasks: Task[]
  hasPending: boolean
  nextPending: Task | null
}

export const tasksApi = {
  /** 获取会话的所有任务 */
  async list(sessionId: string): Promise<TaskListResponse> {
    const res = await fetch(`${BASE_URL}/api/tasks/${sessionId}`)
    if (!res.ok) throw new Error(`Failed to list tasks: ${res.status}`)
    return res.json()
  },

  /** 获取单个任务 */
  async get(sessionId: string, taskId: string): Promise<Task> {
    const res = await fetch(`${BASE_URL}/api/tasks/${sessionId}/${taskId}`)
    if (!res.ok) throw new Error(`Failed to get task: ${res.status}`)
    const data = await res.json()
    return data.task
  },

  /** 创建任务 */
  async create(sessionId: string, input: { subject: string; body?: string; priority?: string; tags?: string[] }): Promise<Task> {
    const res = await fetch(`${BASE_URL}/api/tasks/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`Failed to create task: ${res.status}`)
    const data = await res.json()
    return data.task
  },

  /** 更新任务 */
  async update(sessionId: string, taskId: string, updates: Record<string, unknown>): Promise<Task> {
    const res = await fetch(`${BASE_URL}/api/tasks/${sessionId}/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) throw new Error(`Failed to update task: ${res.status}`)
    const data = await res.json()
    return data.task
  },

  /** 重置任务列表 */
  async reset(sessionId: string): Promise<void> {
    await fetch(`${BASE_URL}/api/tasks/${sessionId}`, { method: 'DELETE' })
  },

  /** 删除单个任务 */
  async remove(sessionId: string, taskId: string): Promise<void> {
    await fetch(`${BASE_URL}/api/tasks/${sessionId}/${taskId}`, { method: 'DELETE' })
  },
}
