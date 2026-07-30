/**
 * Task types — 任务管理类型定义
 */

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

export type CreateTaskInput = {
  subject: string
  body?: string
  owner?: string
  priority?: TaskPriority
  tags?: string[]
}

export type UpdateTaskInput = {
  subject?: string
  body?: string
  status?: TaskStatus
  owner?: string
  priority?: TaskPriority
  tags?: string[]
  completedAt?: string
  cost?: number
}
