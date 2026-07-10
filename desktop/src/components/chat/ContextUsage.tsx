import { useMemo } from 'react'

const CONTEXT_WINDOW = 200_000
const RING_SIZE = 24
const STROKE_WIDTH = 3
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function formatK(n: number): string {
  return `${(n / 1000).toFixed(0)}K`
}

type Props = {
  /** Input tokens from the last request */
  inputTokens: number
  /** Whether a query is currently running */
  queryRunning?: boolean
}

export function ContextUsage({ inputTokens, queryRunning }: Props) {
  const { total, pct, color, dashOffset } = useMemo(() => {
    const t = inputTokens
    const p = Math.min(100, Math.round((t / CONTEXT_WINDOW) * 100))
    const c = p > 80 ? 'var(--color-error)' : p > 50 ? 'var(--color-warning)' : 'var(--color-success)'
    const fraction = Math.min(1, t / CONTEXT_WINDOW)
    const offset = CIRCUMFERENCE * (1 - fraction)
    return { total: t, pct: p, color: c, dashOffset: offset }
  }, [inputTokens])

  if (total === 0 && !queryRunning) return null

  return (
    <div className="group relative shrink-0">
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        className={total === 0 ? 'animate-spin' : '-rotate-90'}
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--color-surface-container-high)"
          strokeWidth={STROKE_WIDTH}
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={total === 0 ? 'var(--color-text-tertiary)' : color}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={total === 0 ? `${CIRCUMFERENCE * 0.25} ${CIRCUMFERENCE * 0.75}` : CIRCUMFERENCE}
          strokeDashoffset={total === 0 ? 0 : dashOffset}
          style={total > 0 ? { transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' } : undefined}
        />
      </svg>

      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-50">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-2.5 py-1.5 shadow-lg">
          <span
            className="text-[11px] font-semibold whitespace-nowrap"
            style={{ color: total === 0 ? 'var(--color-text-tertiary)' : color }}
          >
            {total === 0 ? '计算中...' : `${pct}% · ${formatK(total)}/${formatK(CONTEXT_WINDOW)}`}
          </span>
        </div>
      </div>
    </div>
  )
}
