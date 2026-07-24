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

export type UsageQueryResult = {
  days: UsageDaySummary[]
  providers: string[]
  rangeDays: number
}

// ── 配置 ─────────────────────────────────────────────────

const CONFIG_DIR = process.env.SPACEAI_CONFIG_DIR || path.join(require('os').homedir(), '.spaceai')
const EVENTS_FILE = path.join(CONFIG_DIR, 'usage', 'events.jsonl')

// ── 核心函数 ─────────────────────────────────────────────

/** 追加一条用量事件记录 */
export async function recordUsage(event: UsageEvent): Promise<void> {
  const dir = path.dirname(EVENTS_FILE)
  await fs.mkdir(dir, { recursive: true })

  const line = JSON.stringify(event) + '\n'
  // 追加写入（原子操作：先写临时文件再 rename 由 JSONL 追加保证, 这里直接用 appendFile）
  await fs.appendFile(EVENTS_FILE, line, 'utf-8')
}

/** 查询指定天数内的用量汇总，可筛选模型 */
export async function queryUsage(
  days: number,
  model?: string,
): Promise<UsageQueryResult> {
  const dayMap = new Map<string, UsageDaySummary>()
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

        // 服务商：优先用记录中的 provider 字段，旧记录回退到模型名推断
        const eventProvider = ev.provider || extractProvider(ev.model)
        providerSet.add(eventProvider)

        if (model && eventProvider !== model) continue

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

  return {
    days: allDays,
    providers: [...providerSet].sort(),
    rangeDays: days,
  }
}

/** 从模型名中提取服务商前缀 */
function extractProvider(model: string): string {
  const lower = model.toLowerCase()
  if (lower.includes('claude')) return 'Anthropic'
  if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3')) return 'OpenAI'
  if (lower.includes('deepseek')) return 'DeepSeek'
  if (lower.includes('qwen')) return 'Qwen'
  if (lower.includes('mi') || lower.includes('moonshot')) return 'Moonshot'
  if (lower.includes('glm') || lower.includes('zhipu')) return 'GLM'
  // 默认用模型名本身
  return model
}
