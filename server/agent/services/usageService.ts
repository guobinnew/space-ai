import fs from 'node:fs/promises'
import path from 'node:path'

// ── 类型定义 ─────────────────────────────────────────────

export type UsageEvent = {
  date: string        // YYYY-MM-DD
  model: string       // 模型名，例如 "claude-sonnet-4-20250514"
  /** 服务商名称（来自设置），例如"我的 Anthropic 代理"；空时 fallback 到模型前缀推断 */
  provider: string
  totalInput: number
  totalOutput: number
  totalCacheRead: number
  totalCacheCreation: number
  timestamp: string   // ISO
  sessionId: string
}

export type UsageDaySummary = {
  date: string
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
}

export type ModelUsageSummary = {
  model: string
  provider: string
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
}

export type UsageQueryResult = {
  days: UsageDaySummary[]
  models: ModelUsageSummary[]
  providers: string[]
  rangeDays: number
}

// ── 配置 ─────────────────────────────────────────────────

const CONFIG_DIR = process.env.SPACEAI_CONFIG_DIR || path.join(require('os').homedir(), '.spaceai')
const EVENTS_FILE = path.join(CONFIG_DIR, 'usage', 'events.jsonl')

// ── 核心函数 ─────────────────────────────────────────────

/** 追加一条用量事件记录（服务商为空时跳过记录） */
export async function recordUsage(event: UsageEvent): Promise<void> {
  if (!event.provider) return // 服务商为空不记录

  const dir = path.dirname(EVENTS_FILE)
  await fs.mkdir(dir, { recursive: true })

  const line = JSON.stringify(event) + '\n'
  // 追加写入（原子操作：先写临时文件再 rename 由 JSONL 追加保证, 这里直接用 appendFile）
  await fs.appendFile(EVENTS_FILE, line, 'utf-8')
}

/** 清理已有记录中服务商为空的条目，返回清理的行数 */
export async function cleanupEmptyProvider(): Promise<number> {
  try {
    const raw = await fs.readFile(EVENTS_FILE, 'utf-8')
    const lines = raw.split('\n').filter(Boolean)
    const kept: string[] = []
    let removed = 0

    for (const line of lines) {
      try {
        const ev = JSON.parse(line) as UsageEvent
        if (!ev.provider) {
          removed++
          continue
        }
        kept.push(line)
      } catch {
        // 跳过损坏的行（保留）
        kept.push(line)
      }
    }

    // 重新写入
    await fs.writeFile(EVENTS_FILE, kept.join('\n') + (kept.length > 0 ? '\n' : ''), 'utf-8')
    return removed
  } catch {
    // 文件不存在或读取失败
    return 0
  }
}

/** 查询指定天数内的用量汇总，可筛选模型 */
export async function queryUsage(
  days: number,
  model?: string,
): Promise<UsageQueryResult> {
  const dayMap = new Map<string, UsageDaySummary>()
  const modelMap = new Map<string, ModelUsageSummary>()
  const providerSet = new Set<string>()
  let lineCount = 0

  try {
    const raw = await fs.readFile(EVENTS_FILE, 'utf-8')
    const lines = raw.split('\n').filter(Boolean)

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    for (const line of lines) {
      lineCount++
      try {
        const ev = JSON.parse(line) as UsageEvent
        const evDate = new Date(ev.date)
        if (evDate < cutoff) continue // 跳过超出范围的记录

        // 服务商：直接用设置中记录的服务商名称；旧记录无 provider 字段则为空
        const eventProvider = ev.provider || ''
        if (eventProvider) providerSet.add(eventProvider)

        if (model && eventProvider !== model) continue

        // 模型维度聚合
        const modelKey = ev.model || 'unknown'
        const existingModel = modelMap.get(modelKey)
        if (existingModel) {
          existingModel.input += ev.totalInput
          existingModel.output += ev.totalOutput
          existingModel.cacheRead += ev.totalCacheRead
          existingModel.cacheCreation += ev.totalCacheCreation
        } else {
          modelMap.set(modelKey, {
            model: modelKey,
            provider: eventProvider,
            input: ev.totalInput,
            output: ev.totalOutput,
            cacheRead: ev.totalCacheRead,
            cacheCreation: ev.totalCacheCreation,
          })
        }

        const existing = dayMap.get(ev.date)
        if (existing) {
          existing.input += ev.totalInput
          existing.output += ev.totalOutput
          existing.cacheRead += ev.totalCacheRead
          existing.cacheCreation += ev.totalCacheCreation
        } else {
          dayMap.set(ev.date, {
            date: ev.date,
            input: ev.totalInput,
            output: ev.totalOutput,
            cacheRead: ev.totalCacheRead,
            cacheCreation: ev.totalCacheCreation,
          })
        }
      } catch {
        // 跳过损坏的行
      }
    }
  } catch {
    // 文件不存在或读取失败：返回空结果
  }

  // 填充范围内缺失的天数（数据为 0 的天也保留，保证图表连续）
  const allDays: UsageDaySummary[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const existing = dayMap.get(dateStr)
    allDays.push(existing ?? { date: dateStr, input: 0, output: 0, cacheRead: 0, cacheCreation: 0 })
  }

  const modelsArr = [...modelMap.values()].sort((a, b) => (b.input + b.output) - (a.input + a.output))

  return {
    days: allDays,
    models: modelsArr,
    providers: [...providerSet].sort(),
    rangeDays: days,
  }
}


