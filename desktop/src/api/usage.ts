/**
 * Usage Statistics API — 获取服务端持久化的用量历史
 */
import { getApiClient } from './client'

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
  const client = await getApiClient()
  const params = new URLSearchParams({ days: String(days) })
  if (model) params.set('model', model)
  const res = await client.fetch(`/api/usage?${params}`)
  if (!res.ok) {
    throw new Error(`Usage API ${res.status}`)
  }
  return res.json() as Promise<UsageQueryResult>
}
