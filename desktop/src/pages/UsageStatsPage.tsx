import { useEffect, useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useChatStore } from '../stores/chatStore'
import { fetchUsage, type UsageQueryResult, type ModelUsageSummary } from '../api/usage'
import { api } from '../api/client'
import { useTranslation } from '../i18n'

type ViewMode = 7 | 30
type GroupBy = 'provider' | 'model'

type LightProvider = { id: string; name: string; model: string }

// ─── 服务商配色方案 ───────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  Anthropic: '#d4a574',
  OpenAI: '#10a37f',
  DeepSeek: '#1a9b7c',
  GLM: '#4a9eff',
  Qwen: '#615ced',
  Moonshot: '#7b68ee',
  MiniMax: '#ff8c42',
}
const FALLBACK_COLORS = ['#6b7280', '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6', '#f97316', '#84cc16']

function colorFor(provider: string): string {
  return PROVIDER_COLORS[provider] || FALLBACK_COLORS[(provider.length + provider.charCodeAt(0)) % FALLBACK_COLORS.length]
}

// ─── 主组件 ──────────────────────────────────────────────

export function UsageStatsPage() {
  const t = useTranslation()
  const chatStore = useChatStore()
  const [view, setView] = useState<ViewMode>(7)
  const [data, setData] = useState<UsageQueryResult | null>(null)
  const [provider, setProvider] = useState<string>('')
  const [providers, setProviders] = useState<LightProvider[]>([])
  const [groupBy, setGroupBy] = useState<GroupBy>('provider')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 获取持久化用量数据
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const pr = provider || undefined
    fetchUsage(view, pr)
      .then((res) => { if (!cancelled) setData(res) })
      .catch((e) => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [view, provider])

  // 获取服务商列表
  useEffect(() => {
    api.get<{ providers: LightProvider[] }>('/api/providers')
      .then((res) => setProviders(res.providers))
      .catch(() => {})
  }, [])

  // 当前活跃会话的实时用量
  const realtime = Object.values(chatStore.sessions).reduce(
    (acc, s) => {
      const u = s.totalUsage
      if (u && (u.totalInput > 0 || u.totalOutput > 0)) {
        acc.input += u.totalInput; acc.output += u.totalOutput
        acc.cacheRead += u.totalCacheRead; acc.cacheCreation += u.totalCacheCreation
        acc.count++
      }
      return acc
    },
    { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, count: 0 },
  )

  const fmt = (n: number) => n.toLocaleString()
  const modelCount = data?.models?.length ?? 0
  const totalUsage = (data?.days ?? []).reduce((s, d) => s + d.input + d.output, 0)

  // 分组图例：从 model 数据提取按服务商或按模型的分组
  const groupsList: Array<{ key: string; color: string; total: number }> = []
  if (data?.models) {
    const tmp = new Map<string, number>()
    for (const m of data.models) {
      const key = groupBy === 'provider' ? m.provider : m.model
      tmp.set(key, (tmp.get(key) ?? 0) + m.input + m.output)
    }
    for (const [key, total] of tmp) {
      groupsList.push({ key, color: colorFor(key), total })
    }
    groupsList.sort((a, b) => b.total - a.total)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none px-6 pt-5 pb-3 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{t('usage.title')}</h1>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
              {([7, 30] as ViewMode[]).map((d) => (
                <button key={d} onClick={() => setView(d)}
                  className={`px-3 py-1.5 transition-colors ${view === d ? 'bg-[var(--color-brand)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'}`}
                >{t('usage.lastDays', { d })}</button>
              ))}
            </div>
          </div>
        </div>
        {error && <p className="text-xs text-[var(--color-error)] mt-1">{error}</p>}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* 实时会话用量 */}
        {realtime.count > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard label={t('usage.realtimeInput')} value={fmt(realtime.input)} color="var(--color-brand)" />
            <StatCard label={t('usage.realtimeOutput')} value={fmt(realtime.output)} color="var(--color-success)" />
            <StatCard label={t('usage.cacheRead')} value={fmt(realtime.cacheRead)} color="var(--color-accent)" />
            <StatCard label={t('usage.cacheCreate')} value={fmt(realtime.cacheCreation)} color="var(--color-warning)" />
            <StatCard label={t('usage.activeSessions')} value={fmt(realtime.count)} color="var(--color-text-primary)" />
          </div>
        )}

        {/* 概览卡片 */}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label={t('usage.totalTokens')} value={fmt(totalUsage)} color="var(--color-brand)" />
            <StatCard label={t('usage.modelCount')} value={fmt(modelCount)} color="var(--color-text-primary)" />
            <StatCard label={t('usage.daysCovered')} value={fmt(data.days.length)} color="var(--color-text-primary)" />
          </div>
        )}

        {/* 图表区 */}
        {loading && <div className="text-sm text-[var(--color-text-tertiary)] py-16 text-center">{t('usage.loading')}</div>}
        {!loading && !error && data && (
          <>
            {/* 控制栏 */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* 分组切换 */}
              <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
                {(['provider', 'model'] as GroupBy[]).map((g) => (
                  <button key={g} onClick={() => setGroupBy(g)}
                    className={`px-3 py-1.5 transition-colors ${groupBy === g ? 'bg-[var(--color-brand)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'}`}
                  >{g === 'provider' ? t('usage.groupByProvider') : t('usage.groupByModel')}</button>
                ))}
              </div>
              {/* 服务商筛选 */}
              <select value={provider} onChange={(e) => setProvider(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text-primary)] outline-none"
              >
                <option value="">{t('usage.allProviders')}</option>
                {providers.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>

            {/* 组合图表（柱状图 + 曲线图） */}
            <CombinedChart days={data.days} />
            {/* 图例 */}
            {groupsList.length > 0 && (
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[var(--color-text-secondary)]">
                {groupsList.map((g) => (
                  <span key={g.key} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: g.color }} />
                    {g.key}
                    <span className="text-[var(--color-text-tertiary)] tabular-nums">{g.total.toLocaleString()}</span>
                  </span>
                ))}
              </div>
            )}

            {/* 模型明细表 */}
            {data.models && data.models.length > 0 && (
              <ModelTable models={data.models} />
            )}

            {/* 无数据提示 */}
            {data.days.length > 0 && totalUsage === 0 && (
              <div className="text-center py-10">
                <div className="text-2xl mb-2">{'\uD83D\uDCCA'}</div>
                <p className="text-sm text-[var(--color-text-secondary)]">{t('usage.noData')}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── 统计卡片 ────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-[11px] text-[var(--color-text-tertiary)] mb-1">{label}</div>
      <div className="text-xl font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  )
}

// ─── 组合图表（柱状图 + 曲线图）───────────────────────────

type DayData = { date: string; input: number; output: number; cacheRead: number; cacheCreation: number }

function CombinedChart({ days }: { days: DayData[] }) {
  const t = useTranslation()
  if (days.length === 0) return null

  // 解析 CSS 变量为实际颜色值（ECharts 不支持 CSS var）
  const cssColor = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000'

  const brandColor = cssColor('--color-brand')
  const successColor = cssColor('--color-success')
  const textSecondary = cssColor('--color-text-secondary')
  const textTertiary = cssColor('--color-text-tertiary')
  const borderColor = cssColor('--color-border')

  const dates = days.map((d) => d.date.slice(5))

  // 格式化数字
  const fmtAxis = (v: number) =>
    v >= 1000000 ? (v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1) + 'M'
      : v >= 1000 ? (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'K'
      : v.toLocaleString()

  const option = useMemo(() => ({
    color: [brandColor, successColor],
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: '#fff',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: { color: '#374151', fontSize: 12 },
      formatter: (params: Array<{ seriesName: string; value: number; axisValueLabel: string }>) => {
        // 去重：相同 seriesName 只显示一个（bar 与 line 同名）
        const seen = new Set<string>()
        const uniq = params.filter((p) => {
          if (seen.has(p.seriesName)) return false
          seen.add(p.seriesName)
          return true
        })
        const date = uniq[0]?.axisValueLabel || ''
        const lines: string[] = [`<b style="color:#374151">${date}</b>`]
        for (const p of uniq) {
          const c = p.seriesName === t('usage.input') ? brandColor : successColor
          lines.push(`<span style="color:${c}">● ${p.seriesName} ${p.value.toLocaleString()}</span>`)
        }
        return lines.join('<br/>')
      },
    },
    legend: {
      show: true,
      top: 0,
      itemWidth: 12,
      itemHeight: 3,
      textStyle: { color: textSecondary, fontSize: 12 },
      data: [t('usage.input'), t('usage.output')],
    },
    grid: { top: 28, right: 10, bottom: 22, left: 48 },
    xAxis: {
      type: 'category' as const,
      data: dates,
      axisLine: { lineStyle: { color: borderColor } },
      axisTick: { show: false },
      axisLabel: {
        color: textTertiary,
        fontSize: 10,
        interval: days.length > 14 ? 'auto' as const : 0,
      },
    },
    yAxis: {
      type: 'value' as const,
      min: 0,
      splitLine: { lineStyle: { color: borderColor, opacity: 0.35 } },
      axisLabel: {
        color: textTertiary,
        fontSize: 11,
        formatter: fmtAxis,
      },
    },
    series: [
      // 柱状图：输入（下方）
      {
        name: t('usage.input'),
        type: 'bar',
        stack: 'total',
        barMaxWidth: 16,
        itemStyle: { color: brandColor, opacity: 0.5, borderRadius: [2, 2, 0, 0] },
        data: days.map((d) => d.input || 0),
      },
      // 柱状图：输出（上方）
      {
        name: t('usage.output'),
        type: 'bar',
        stack: 'total',
        barMaxWidth: 16,
        itemStyle: { color: successColor, opacity: 0.7, borderRadius: [2, 2, 0, 0] },
        data: days.map((d) => d.output || 0),
      },
      // 折线：输入
      {
        name: t('usage.input'),
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2 },
        data: days.map((d) => d.input || 0),
      },
      // 折线：输出
      {
        name: t('usage.output'),
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2 },
        data: days.map((d) => d.output || 0),
      },
    ],
  }), [days, brandColor, successColor, textSecondary, textTertiary, borderColor])

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <ReactECharts option={option} style={{ height: 180 }} notMerge />
    </div>
  )
}

// ─── 模型明细表 ──────────────────────────────────────────

function ModelTable({ models }: { models: ModelUsageSummary[] }) {
  const t = useTranslation()
  const fmt = (n: number) => n.toLocaleString()
  const truncate = (s: string, len: number) => s.length > len ? s.slice(0, len) + '…' : s

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-container)]">
              <th className="text-left px-4 py-2.5 font-medium text-[var(--color-text-primary)]">{t('usage.colModel')}</th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--color-text-primary)]">{t('usage.colProvider')}</th>
              <th className="text-right px-4 py-2.5 font-medium text-[var(--color-text-primary)]">{t('usage.colInput')}</th>
              <th className="text-right px-4 py-2.5 font-medium text-[var(--color-text-primary)]">{t('usage.colOutput')}</th>
              <th className="text-right px-4 py-2.5 font-medium text-[var(--color-text-primary)]">{t('usage.colCacheRead')}</th>
              <th className="text-right px-4 py-2.5 font-medium text-[var(--color-text-primary)]">{t('usage.colCacheCreate')}</th>
              <th className="text-right px-4 py-2.5 font-medium text-[var(--color-text-primary)]">{t('usage.colTotal')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {models.map((m) => (
              <tr key={m.model} className="hover:bg-[var(--color-surface-hover)]/30 transition-colors">
                <td className="px-4 py-2.5 text-[var(--color-text-primary)]" title={m.model}>
                  {truncate(m.model, 45)}
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ backgroundColor: colorFor(m.provider) + '20', color: colorFor(m.provider) }}>
                    {m.provider}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-primary)]">{fmt(m.input)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-primary)]">{fmt(m.output)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-tertiary)]">{fmt(m.cacheRead)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-tertiary)]">{fmt(m.cacheCreation)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-[var(--color-text-primary)]">{fmt(m.input + m.output)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface-container)] font-medium">
              <td colSpan={2} className="px-4 py-2.5 text-[var(--color-text-primary)]">{t('usage.total')}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-primary)]">{fmt(models.reduce((a, m) => a + m.input, 0))}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-primary)]">{fmt(models.reduce((a, m) => a + m.output, 0))}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-tertiary)]">{fmt(models.reduce((a, m) => a + m.cacheRead, 0))}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-tertiary)]">{fmt(models.reduce((a, m) => a + m.cacheCreation, 0))}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-text-primary)]">{fmt(models.reduce((a, m) => a + m.input + m.output, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
