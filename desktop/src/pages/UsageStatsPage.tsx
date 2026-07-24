import { useEffect, useState } from 'react'
import { useChatStore } from '../stores/chatStore'
import { fetchUsage, type UsageDaySummary, type UsageQueryResult } from '../api/usage'
import { api } from '../api/client'

type ViewMode = 7 | 30

type LightProvider = {
  id: string
  name: string
  model: string
}

export function UsageStatsPage() {
  const sessions = useChatStore().sessions
  const [view, setView] = useState<ViewMode>(7)
  const [data, setData] = useState<UsageQueryResult | null>(null)
  const [provider, setProvider] = useState<string>('')
  const [providers, setProviders] = useState<LightProvider[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 获取持久化用量数据
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchUsage(view, provider || undefined)
      .then((res) => { if (!cancelled) setData(res) })
      .catch((e) => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [view, provider])

  // 获取服务商列表（来自设置）
  useEffect(() => {
    api.get<{ providers: LightProvider[]; activeId: string }>('/api/providers')
      .then((res) => setProviders(res.providers))
      .catch(() => {})
  }, [])

  // 会话内存用量聚合
  let memTotalInput = 0
  let memTotalOutput = 0
  let memTotalCacheRead = 0
  let memTotalCacheCreation = 0
  let memSessionCount = 0
  for (const key of Object.keys(sessions)) {
    const s = sessions[key]
    if (s.totalUsage && (s.totalUsage.totalInput > 0 || s.totalUsage.totalOutput > 0)) {
      memTotalInput += s.totalUsage.totalInput
      memTotalOutput += s.totalUsage.totalOutput
      memTotalCacheRead += s.totalUsage.totalCacheRead
      memTotalCacheCreation += s.totalUsage.totalCacheCreation
      memSessionCount++
    }
  }

  const hasMemoryData = memSessionCount > 0 || memTotalInput > 0
  const fmt = (n: number) => n.toLocaleString()

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6 overflow-y-auto">
      <h1 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">用量统计</h1>
      <p className="text-xs text-[var(--color-text-tertiary)] mb-6">
        持久化用量（服务端） · {data ? `最近 ${view} 天` : '加载中…'}
      </p>

      {/* 控制栏 */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
          {([7, 30] as ViewMode[]).map((d) => (
            <button
              key={d}
              onClick={() => setView(d)}
              className={`px-3 py-1.5 transition-colors ${view === d ? 'bg-[var(--color-brand)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'}`}
            >
              最近 {d} 天
            </button>
          ))}
        </div>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text-primary)] outline-none"
        >
          <option value="">全部服务商</option>
          {providers.map((p) => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* 图表区域 */}
      {loading && <div className="text-xs text-[var(--color-text-tertiary)] py-10 text-center">加载用量数据…</div>}
      {error && <div className="text-xs text-[var(--color-text-danger)] py-10 text-center">{error}</div>}
      {!loading && !error && data && <UsageBarChart days={data.days} />}

      {/* 会话内存用量 */}
      {hasMemoryData && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 mt-6">
          <h2 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
            本次会话用量（内存，仅当前会话期间有效）
          </h2>
          <div className="space-y-2">
            <SummaryRow label="会话数" value={String(memSessionCount)} />
            <SummaryRow label="总输入" value={fmt(memTotalInput)} />
            <SummaryRow label="总输出" value={fmt(memTotalOutput)} />
            <SummaryRow label="缓存读" value={fmt(memTotalCacheRead)} />
            <SummaryRow label="缓存创" value={fmt(memTotalCacheCreation)} />
            <div className="border-t border-[var(--color-border)] pt-2 mt-2">
              <SummaryRow label="总计（输入+输出）" value={fmt(memTotalInput + memTotalOutput)} bold />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 柱状图组件 ────────────────────────────────────────

function UsageBarChart({ days }: { days: UsageDaySummary[] }) {
  if (days.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-3xl mb-3 text-[var(--color-text-tertiary)]">{'\uD83D\uDCCA'}</div>
        <p className="text-sm text-[var(--color-text-secondary)]">暂无用量数据</p>
        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">发送消息后，用量将在每轮对话结束时持久化记录。</p>
      </div>
    )
  }

  const maxInput = Math.max(...days.map((d) => d.input), 1)
  const maxOutput = Math.max(...days.map((d) => d.output), 1)
  const barMax = Math.max(maxInput, maxOutput)

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      {/* 双色柱状图 */}
      <div className="flex items-end gap-[2px] h-36 pb-1">
        {days.map((d) => {
          const inputH = Math.max(2, (d.input / barMax) * 120)
          const outputH = Math.max(2, (d.output / barMax) * 120)
          const totalH = inputH + outputH
          const hasData = d.input > 0 || d.output > 0
          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col items-center justify-end group relative"
              style={{ minHeight: Math.max(totalH, 4) }}
            >
              {/* tooltip */}
              <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-md px-2 py-1 shadow-lg text-xs whitespace-nowrap">
                <div className="font-medium text-[var(--color-text-primary)]">{d.date}</div>
                {hasData ? (
                  <>
                    <div className="text-[var(--color-brand)]">输入: {d.input.toLocaleString()}</div>
                    <div className="text-[var(--color-success)]">输出: {d.output.toLocaleString()}</div>
                    {(d.cacheRead > 0 || d.cacheCreation > 0) && (
                      <>
                        <div className="text-[var(--color-accent)]">缓存读: {d.cacheRead.toLocaleString()}</div>
                        <div className="text-[var(--color-warning)]">缓存创: {d.cacheCreation.toLocaleString()}</div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="text-[var(--color-text-tertiary)]">无用数据</div>
                )}
              </div>
              {/* 柱子 —— 输出段 */}
              <div
                className="w-full rounded-t-[2px] transition-opacity group-hover:opacity-80"
                style={{ height: `${outputH}px`, backgroundColor: 'var(--color-success)', opacity: hasData ? 0.8 : 0.1 }}
              />
              {/* 柱子 —— 输入段 */}
              <div
                className="w-full transition-opacity group-hover:opacity-80"
                style={{ height: `${inputH}px`, backgroundColor: 'var(--color-brand)', opacity: hasData ? 0.6 : 0.08 }}
              />
              {/* 底部小点标记有数据的天 */}
              {hasData && (
                <div className="absolute bottom-0 w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--color-brand)', opacity: 0.4 }} />
              )}
            </div>
          )
        })}
      </div>
      {/* 日期标签 */}
      <div className="flex gap-[2px] mt-1">
        {days.map((d, i) => {
          const showLabel = days.length <= 14 || i % Math.ceil(days.length / 14) === 0 || i === days.length - 1
          return (
            <div key={d.date} className="flex-1 text-center">
              <span className={`text-[9px] text-[var(--color-text-tertiary)] ${showLabel ? '' : 'invisible'}`}>
                {d.date.slice(5)}
              </span>
            </div>
          )
        })}
      </div>
      {/* 图例 */}
      <div className="flex items-center gap-4 mt-3 text-[11px] text-[var(--color-text-tertiary)]">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--color-brand)', opacity: 0.6 }} />
          输入
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--color-success)', opacity: 0.8 }} />
          输出
        </div>
        <span className="ml-auto text-[var(--color-text-tertiary)]">
          {days.filter((d) => d.input + d.output > 0).length}/{days.length} 天有数据
        </span>
      </div>
    </div>
  )
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-[var(--color-text-secondary)]">{label}</span>
      <span className={`tabular-nums ${bold ? 'font-semibold text-[var(--color-text-primary)]' : 'text-[var(--color-text-primary)]'}`}>{value}</span>
    </div>
  )
}
