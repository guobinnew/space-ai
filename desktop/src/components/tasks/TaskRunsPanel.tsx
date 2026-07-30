import { useEffect, useState } from 'react'
import { fetchTaskRuns, deleteRunRecord, type RunRecord } from '../../api/scheduled-tasks'
import { useTranslation, localeTag } from '../../i18n'

type Props = { taskId: string; onClose: () => void; refreshKey?: number }

const STATUS_MAP: Record<string, { key: string; color: string }> = {
  running:   { key: 'task.statusRunning',   color: 'var(--color-warning)' },
  completed: { key: 'task.statusCompleted', color: 'var(--color-success)' },
  failed:    { key: 'task.statusFailed',    color: 'var(--color-error)' },
  timeout:   { key: 'task.statusTimeout',   color: 'var(--color-error)' },
  aborted:   { key: 'task.statusAborted',   color: 'var(--color-text-tertiary)' },
}

export function TaskRunsPanel({ taskId, onClose, refreshKey }: Props) {
  const t = useTranslation()
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = () => {
    fetchTaskRuns(taskId).then((r) => { setRuns(r); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { setLoading(true); load() }, [taskId])

  // Auto-poll while a run is running
  const hasRunning = runs.some((r) => r.status === 'running')
  useEffect(() => {
    if (!hasRunning) return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [hasRunning])

  // Re-fetch when refreshKey changes
  useEffect(() => { if (refreshKey) load() }, [refreshKey])

  const handleDelete = async (runId: string) => {
    if (!confirm(t('task.confirmDeleteRun'))) return
    await deleteRunRecord(runId)
    setRuns((p) => p.filter((r) => r.id !== runId))
  }

  return (
    <div className="mt-2 mb-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--color-surface-container)]">
        <span className="text-xs font-medium text-[var(--color-text-primary)]">{t('task.runsTitle')}</span>
        <button onClick={onClose} className="p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Content */}
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin w-4 h-4 border-2 border-[var(--color-brand)] border-t-transparent rounded-full" />
          </div>
        ) : runs.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-[var(--color-text-tertiary)]">{t('task.runsEmpty')}</div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]/50">
            {runs.map((run) => {
              const cfg = STATUS_MAP[run.status] || STATUS_MAP.failed!
              const isExpanded = expandedId === run.id
              return (
                <div key={run.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                    <span className="text-xs font-medium" style={{ color: cfg.color }}>{t(cfg.key)}</span>
                    <span className="text-xs text-[var(--color-text-tertiary)]">{new Date(run.startedAt).toLocaleString(localeTag())}</span>
                    {run.finishedAt && (
                      <span className="text-xs text-[var(--color-text-tertiary)]">
                        ({((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toFixed(1)}s)
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      {run.error && (
                        <button onClick={() => setExpandedId(isExpanded ? null : run.id)}
                          className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isExpanded ? 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21' : 'M15 12a3 3 0 11-6 0 3 3 0 016 0z'} /></svg>
                        </button>
                      )}
                      {run.error && (
                        <span className="text-xs text-[var(--color-error)] truncate max-w-[160px]" title={run.error}>{t('task.runsError')}</span>
                      )}
                      <button onClick={() => handleDelete(run.id)}
                        className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                  {isExpanded && run.error && (
                    <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded border border-[var(--color-error)]/20 bg-[var(--color-error)]/8 p-2.5 text-xs text-[var(--color-error)]">
                      {run.error}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
