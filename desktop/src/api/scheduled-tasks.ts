/**
 * Scheduled Tasks API Client
 *
 * api client 的 get/post/put/delete 直接返回解析后的 JSON，无需 .json()
 */
import { api } from './client'

export type ScheduledTask = {
  id: string
  name?: string
  description?: string
  cron: string
  prompt: string
  createdAt: number
  lastFiredAt?: string
  enabled?: boolean
}

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

/** 列出所有任务 */
export async function fetchScheduledTasks(): Promise<ScheduledTask[]> {
  const data = await api.get<{ tasks: ScheduledTask[] }>('/api/scheduled-tasks')
  return data.tasks ?? []
}

/** 创建任务 */
export async function createScheduledTask(fields: {
  name?: string
  description?: string
  cron: string
  prompt: string
}): Promise<ScheduledTask> {
  return api.post<ScheduledTask>('/api/scheduled-tasks', fields)
}

/** 更新任务 */
export async function updateScheduledTask(id: string, updates: Partial<ScheduledTask>): Promise<ScheduledTask> {
  return api.put<ScheduledTask>(`/api/scheduled-tasks/${id}`, updates)
}

/** 删除任务 */
export async function deleteScheduledTask(id: string): Promise<void> {
  await api.delete(`/api/scheduled-tasks/${id}`)
}

/** 立即执行 */
export async function executeScheduledTask(id: string): Promise<void> {
  await api.post(`/api/scheduled-tasks/${id}/exec`)
}

/** 中止执行 */
export async function abortScheduledTask(id: string): Promise<void> {
  await api.post(`/api/scheduled-tasks/${id}/abort`)
}

/** 获取所有运行记录 */
export async function fetchRecentRuns(limit = 50): Promise<RunRecord[]> {
  const data = await api.get<{ runs: RunRecord[] }>(`/api/scheduled-tasks/runs?limit=${limit}`)
  return data.runs ?? []
}

/** 获取某任务的运行记录 */
export async function fetchTaskRuns(taskId: string): Promise<RunRecord[]> {
  const data = await api.get<{ runs: RunRecord[] }>(`/api/scheduled-tasks/${taskId}/runs`)
  return data.runs ?? []
}

/** 删除某条运行记录 */
export async function deleteRunRecord(runId: string): Promise<void> {
  await api.delete(`/api/scheduled-tasks/runs/${runId}`)
}
