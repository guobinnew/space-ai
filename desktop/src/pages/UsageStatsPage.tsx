import React, { useEffect, useState } from 'react'
import { useChatStore } from '../stores/chatStore'
import { fetchUsage, type UsageQueryResult, type ModelUsageSummary } from '../api/usage'
import { api } from '../api/client'

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
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Token 用量统计</h1>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
              {([7, 30] as ViewMode[]).map((d) => (
                <button key={d} onClick={() => setView(d)}
                  className={`px-3 py-1.5 transition-colors ${view === d ? 'bg-[var(--color-brand)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'}`}
                >最近 {d} 天</button>
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
            <StatCard label="实时 Input" value={fmt(realtime.input)} color="var(--color-brand)" />
            <StatCard label="实时 Output" value={fmt(realtime.output)} color="var(--color-success)" />
            <StatCard label="缓存读" value={fmt(realtime.cacheRead)} color="var(--color-accent)" />
            <StatCard label="缓存创" value={fmt(realtime.cacheCreation)} color="var(--color-warning)" />
            <StatCard label="活跃会话" value={fmt(realtime.count)} color="var(--color-text-primary)" />
          </div>
        )}

        {/* 概览卡片 */}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="总 Token 数" value={fmt(totalUsage)} color="var(--color-brand)" />
            <StatCard label="模型数" value={fmt(modelCount)} color="var(--color-text-primary)" />
            <StatCard label="跨天数" value={fmt(data.days.length)} color="var(--color-text-primary)" />
          </div>
        )}

        {/* 图表区 */}
        {loading && <div className="text-sm text-[var(--color-text-tertiary)] py-16 text-center">加载用量数据…</div>}
        {!loading && !error && data && (
          <>
            {/* 控制栏 */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* 分组切换 */}
              <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs">
                {(['provider', 'model'] as GroupBy[]).map((g) => (
                  <button key={g} onClick={() => setGroupBy(g)}
                    className={`px-3 py-1.5 transition-colors ${groupBy === g ? 'bg-[var(--color-brand)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'}`}
                  >{g === 'provider' ? '按服务商' : '按模型'}</button>
                ))}
              </div>
              {/* 服务商筛选 */}
              <select value={provider} onChange={(e) => setProvider(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text-primary)] outline-none"
              >
                <option value="">全部服务商</option>
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
                <p className="text-sm text-[var(--color-text-secondary)]">选定条件下暂无用量数据</p>
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
  if (days.length === 0) return null

  const containerRef = React.useRef<HTMLDivElement>(null)

  const W = 600
  const H = 180
  const PAD = { t: 20, r: 12, b: 32, l: 48 }
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b

  // 统一 Y 轴范围：柱子取 input+output，折线只考虑 input/output
  const barMax = Math.max(...days.map((d) => d.input + d.output), 1)
  const lineMax = Math.max(...days.map((d) => Math.max(d.input, d.output)), 1)
  const maxVal = Math.max(barMax, lineMax)
  const niceMax = Math.ceil(maxVal / 10 ** Math.max(0, Math.floor(Math.log10(maxVal)) - 1)) * 10 ** Math.max(0, Math.floor(Math.log10(maxVal)) - 1)

  const barW = Math.min(16, plotW / days.length * 0.5)
  const gap = plotW / days.length

  const xCenter = (i: number) => PAD.l + i * gap + gap / 2
  const yScale = (v: number) => PAD.t + plotH - (v / niceMax) * plotH

  // 光滑曲线（Catmull-Rom → 三次贝塞尔）
  const smoothLine = (key: 'input' | 'output') => {
    const pts = days.map((d, i) => ({ x: xCenter(i), y: yScale(d[key]) }))
    if (pts.length === 0) return ''
    if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`
    let d = `M${pts[0].x},${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2 >= pts.length ? pts.length - 1 : i + 2]
      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
    }
    return d
  }

  // Y 轴刻度
  const yTicks = 4
  const yLabels: number[] = []
  for (let i = 0; i <= yTicks; i++) yLabels.push((niceMax / yTicks) * i)

  // X 轴日期标签
  const xLabelIndices = days.map((_, i) => i).filter((i) => {
    if (days.length <= 14) return true
    if (i === 0 || i === days.length - 1) return true
    return i % Math.ceil(days.length / 10) === 0
  })

  const [hoverIdx, setHoverIdx] = React.useState(-1)

  // tooltip 定位：与柱子中心 xCenter(i) 一致
  const tooltipLeft = React.useMemo(() => {
    if (hoverIdx < 0 || !containerRef.current) return '50%'
    const svgW = containerRef.current.clientWidth
    const pixelX = (xCenter(hoverIdx) / W) * svgW
    const pct = (pixelX / svgW) * 100
    if (pct < 15) return '12px'
    if (pct > 85) return undefined
    return `${pct}%`
  }, [hoverIdx, days.length])

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      {/* 图例 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-[var(--color-text-secondary)]">
        <LegendItem color="var(--color-brand)" label="输入" />
        <LegendItem color="var(--color-success)" label="输出" />
      </div>

      <div ref={containerRef} className="relative overflow-x-auto" style={{ minHeight: H / 600 * 100 + 'vw' }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: days.length > 30 ? 800 : undefined }}>
          {/* —— 背景网格 —— */}
          {yLabels.map((v) => (
            <g key={v}>
              <line x1={PAD.l} y1={yScale(v)} x2={W - PAD.r} y2={yScale(v)}
                stroke="var(--color-border)" strokeWidth={0.5} opacity={0.4} />
              <text x={PAD.l - 6} y={yScale(v) + 4} textAnchor="end"
                fill="var(--color-text-tertiary)" style={{ fontSize: 11 }} className="tabular-nums">
                {v >= 1000000 ? (v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1) + 'M'
                  : v >= 1000 ? (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'K'
                  : v.toLocaleString()}
              </text>
            </g>
          ))}

          {/* —— 堆叠柱 —— */}
          {days.map((d, i) => {
            const cx = xCenter(i)
            const y0 = yScale(0)
            const yOut = yScale(d.output)
            const yIn = yScale(d.input + d.output)
            return (
              <g key={`bar-${i}`}>
                <rect x={cx - barW / 2} y={yOut} width={barW} height={Math.max(1, y0 - yOut)}
                  fill="var(--color-success)" opacity={d.input + d.output > 0 ? 0.6 : 0.06}
                  rx={1} />
                {d.input > 0 && (
                  <rect x={cx - barW / 2} y={yIn} width={barW} height={Math.max(1, yOut - yIn)}
                    fill="var(--color-brand)" opacity={0.45} rx={1} />
                )}
              </g>
            )
          })}

          {/* —— 光滑折线 —— */}
          <path d={smoothLine('input')} fill="none" stroke="var(--color-brand)" strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round" />
          <path d={smoothLine('output')} fill="none" stroke="var(--color-success)" strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round" />

          {/* —— X 轴标签 —— */}
          {xLabelIndices.map((i) => (
            <text key={i} x={xCenter(i)} y={H - 4} textAnchor="middle"
              fill="var(--color-text-tertiary)" style={{ fontSize: 11 }}>
              {days[i].date.slice(5)}
            </text>
          ))}

          {/* —— hover 热区 —— */}
          {days.map((d, i) => {
            const cx = xCenter(i)
            return (
              <g key={`hover-${i}`}>
                <rect x={PAD.l + i * gap} y={PAD.t} width={gap} height={plotH}
                  fill="transparent" className="cursor-pointer"
                  onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(-1)} />
                {hoverIdx === i && (
                  <>
                    <line x1={cx} y1={PAD.t} x2={cx} y2={PAD.t + plotH}
                      stroke="var(--color-border)" strokeWidth={1} opacity={0.5} />
                    <circle cx={cx} cy={yScale(d.input)} r={3} fill="var(--color-brand)" />
                    <circle cx={cx} cy={yScale(d.output)} r={3} fill="var(--color-success)" />
                  </>
                )}
              </g>
            )
          })}
        </svg>

        {/* hover tooltip */}
        {hoverIdx >= 0 && (
          <div className="absolute top-0 z-10 -translate-x-1/2 pointer-events-none"
            style={{
              left: tooltipLeft ?? 'auto',
              right: tooltipLeft === undefined ? '12px' : 'auto',
            }}>
            <div className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-md px-2.5 py-1.5 shadow-lg text-xs whitespace-nowrap">
              <div className="font-medium text-[var(--color-text-primary)] mb-1">{days[hoverIdx].date}</div>
              <div className="text-[var(--color-brand)]">输入 {days[hoverIdx].input.toLocaleString()}</div>
              <div className="text-[var(--color-success)]">输出 {days[hoverIdx].output.toLocaleString()}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-[2px] rounded-full shrink-0" style={{
        backgroundColor: color,
        ...(dashed ? { backgroundImage: `repeating-linear-gradient(to right, ${color} 0, ${color} 4px, transparent 4px, transparent 7px)` } : {}),
      }} />
      {label}
    </span>
  )
}

// ─── 模型明细表 ──────────────────────────────────────────

function ModelTable({ models }: { models: ModelUsageSummary[] }) {
  const fmt = (n: number) => n.toLocaleString()
  const truncate = (s: string, len: number) => s.length > len ? s.slice(0, len) + '…' : s

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-container)]">
              <th className="text-left px-4 py-2.5 font-medium text-[var(--color-text-primary)]">模型</th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--color-text-primary)]">服务商</th>
              <th className="text-right px-4 py-2.5 font-medium text-[var(--color-text-primary)]">Input</th>
              <th className="text-right px-4 py-2.5 font-medium text-[var(--color-text-primary)]">Output</th>
              <th className="text-right px-4 py-2.5 font-medium text-[var(--color-text-primary)]">缓存读</th>
              <th className="text-right px-4 py-2.5 font-medium text-[var(--color-text-primary)]">缓存创</th>
              <th className="text-right px-4 py-2.5 font-medium text-[var(--color-text-primary)]">总计</th>
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
              <td colSpan={2} className="px-4 py-2.5 text-[var(--color-text-primary)]">合计</td>
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
