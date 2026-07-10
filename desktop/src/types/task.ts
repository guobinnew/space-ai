/** 前端任务类型 — 与服务端 Task 对应 */

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'

export type TaskPriority = 'low' | 'medium' | 'high'

export type Task = {
  id: string
  subject: string
  body?: string
  status: TaskStatus
  owner: string
  createdBy: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  outputFile?: string
  tags: string[]
  priority: TaskPriority
  cost?: number
}
