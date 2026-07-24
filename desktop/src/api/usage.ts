/**
 * Usage Statistics API — 获取服务端持久化的用量历史
 */
import { api } from './client'

export type UsageDaySummary = {
  date: string
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
}

export type UsageQueryResult = {
  days: UsageDaySummary[]
  providers: string[]
  rangeDays: number
}

export async function fetchUsage(days: number = 30, model?: string): Promise<UsageQueryResult> {
  const params = new URLSearchParams({ days: String(days) })
  if (model) params.set('model', model)
  return api.get<UsageQueryResult>(`/api/usage?${params}`)
}
