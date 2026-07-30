import { useState, useRef, useEffect } from 'react'
import type { ScheduledTask } from '../../api/scheduled-tasks'
import { executeScheduledTask, deleteScheduledTask, updateScheduledTask, fetchTaskRuns } from '../../api/scheduled-tasks'
import { describeCron } from '../../lib/cronDescribe'
import { TaskRunsPanel } from './TaskRunsPanel'
import { NewTaskModal } from './NewTaskModal'
import { useTranslation, localeTag } from '../../i18n'
import { useUIStore } from '../../stores/uiStore'

type Props = {
  task: ScheduledTask
  showLogs: boolean
  onToggleLogs: () => void
  onRefresh: () => void
}

type ConfirmAction = 'run' | 'toggle' | 'delete' | null

export function TaskRow({ task, showLogs, onToggleLogs, onRefresh }: Props) {
  const t = useTranslation()
  const { locale } = useUIStore()
  const [showEdit, setShowEdit] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [logsRefreshKey, setLogsRefreshKey] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!showMenu && !confirmAction) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (showMenu && menuRef.current && !menuRef.current.contains(target)) setShowMenu(false)
      if (confirmAction && confirmRef.current && !confirmRef.current.contains(target)) setConfirmAction(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu, confirmAction])

  // 组件卸载时清理轮询
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const handleRunNow = async () => {
    setConfirmAction(null)
    setIsRunning(true)
    if (!showLogs) onToggleLogs()
    try {
      await executeScheduledTask(task.id)
      setLogsRefreshKey((k) => k + 1)
      // 轮询检测任务是否完成
      pollRef.current = setInterval(async () => {
        try {
          const runs = await fetchTaskRuns(task.id)
          const latest = runs[0]
          if (!latest || latest.status !== 'running') {
            setIsRunning(false)
            setLogsRefreshKey((k) => k + 1)
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
          }
        } catch {}
      }, 3000)
    } catch {
      setIsRunning(false)
    }
  }

  const handleToggle = () => {
    setConfirmAction(null)
    setShowMenu(false)
    updateScheduledTask(task.id, { enabled: !task.enabled }).then(onRefresh)
  }

  const handleDelete = () => {
    setConfirmAction(null)
    setShowMenu(false)
    deleteScheduledTask(task.id).then(onRefresh)
  }

  const iconBtn = 'p-1.5 rounded-md transition-colors'

  return (
    <div className="border-b border-[var(--color-border)]/50">
      <div className="flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface-container)]/40 transition-colors group">
        {/* Left */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className={`w-2 h-2 rounded-full shrink-0 ${task.enabled !== false ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-tertiary)]'}`} />
          <div className="min-w-0">
            <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">{task.name || task.id.slice(0, 8)}</div>
            {task.description && (
              <div className="text-xs text-[var(--color-text-secondary)] truncate">{task.description}</div>
            )}
            <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
              <span>{new Date(task.createdAt).toLocaleDateString(localeTag())}</span>
              {task.lastFiredAt && <span>{new Date(task.lastFiredAt).toLocaleString(localeTag())}</span>}
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-[var(--color-text-tertiary)]" title={task.cron}>
            {describeCron(task.cron, locale)}
          </span>

          <div className="flex items-center gap-0.5">
            {/* Run Now */}
            <div className="relative" ref={confirmAction === 'run' ? confirmRef : undefined}>
              <button onClick={() => isRunning || task.enabled === false ? undefined : setConfirmAction(confirmAction === 'run' ? null : 'run')}
                disabled={isRunning || task.enabled === false}
                className={`${iconBtn} ${task.enabled !== false ? 'text-[var(--color-brand)] hover:bg-[var(--color-brand)]/10' : 'text-[var(--color-text-tertiary)] cursor-not-allowed'} disabled:opacity-50`}
              >
                <svg className={`w-[18px] h-[18px] ${isRunning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {isRunning
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  }
                </svg>
              </button>
              {confirmAction === 'run' && (
                <ConfirmPopover message={t('task.runNowConfirm')} confirmLabel={t('scheduledTasks.runNow')} onConfirm={handleRunNow} onCancel={() => setConfirmAction(null)} cancelLabel={t('common.cancel')} />
              )}
            </div>

            {/* View Logs */}
            <button onClick={onToggleLogs}
              className={`${iconBtn} ${showLogs ? 'text-[var(--color-brand)] bg-[var(--color-brand)]/10' : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-container)]'}`}
            >
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            </button>

            {/* More menu */}
            <div className="relative" ref={menuRef}>
              <button onClick={() => { setShowMenu(!showMenu); setConfirmAction(null) }}
                className={`${iconBtn} text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-container)]`}
              >
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
              </button>

              {showMenu && !confirmAction && (
                <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg py-1">
                  <button onClick={() => { setShowMenu(false); setShowEdit(true) }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-left rounded text-[var(--color-text-primary)] hover:bg-[var(--color-surface-container)] transition-colors">
                    <svg className="w-4 h-4 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    {t('common.edit')}
                  </button>
                  <button onClick={() => setConfirmAction('toggle')}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-left rounded text-[var(--color-text-primary)] hover:bg-[var(--color-surface-container)] transition-colors">
                    <svg className="w-4 h-4 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={task.enabled !== false ? 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z' : 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z'} /></svg>
                    {task.enabled !== false ? t('task.disable') : t('task.enable')}
                  </button>
                  <div className="my-1 h-px bg-[var(--color-border)]/50" />
                  <button onClick={() => setConfirmAction('delete')}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-left rounded text-[var(--color-error)] hover:bg-[var(--color-error)]/8 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    {t('common.delete')}
                  </button>
                </div>
              )}

              {confirmAction === 'toggle' && (
                <div ref={confirmRef}>
                  <ConfirmPopover
                    message={task.enabled !== false ? t('task.disableConfirm') : t('task.enableConfirm')}
                    confirmLabel={task.enabled !== false ? t('task.disable') : t('task.enable')}
                    onConfirm={handleToggle} onCancel={() => { setConfirmAction(null); setShowMenu(false) }} cancelLabel={t('common.cancel')}
                  />
                </div>
              )}
              {confirmAction === 'delete' && (
                <div ref={confirmRef}>
                  <ConfirmPopover
                    message={t('task.deleteConfirmTask')}
                    confirmLabel={t('common.delete')} onConfirm={handleDelete}
                    onCancel={() => { setConfirmAction(null); setShowMenu(false) }} cancelLabel={t('common.cancel')}
                    variant="error"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showLogs && (
        <div className="px-4 pb-3">
          <TaskRunsPanel taskId={task.id} onClose={onToggleLogs} refreshKey={logsRefreshKey} />
        </div>
      )}

      {showEdit && (
        <NewTaskModal open editTask={task} onClose={() => { setShowEdit(false); onRefresh() }} />
      )}
    </div>
  )
}

function ConfirmPopover({ message, confirmLabel, onConfirm, onCancel, cancelLabel, variant = 'brand' }: {
  message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; cancelLabel: string; variant?: 'brand' | 'error'
}) {
  return (
    <div className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg p-3">
      <p className="text-xs text-[var(--color-text-secondary)] mb-2.5">{message}</p>
      <div className="flex justify-end gap-1.5">
        <button onClick={onCancel}
          className="px-2.5 py-1 text-xs rounded text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-container)] transition-colors">{cancelLabel}</button>
        <button onClick={onConfirm}
          className={`px-2.5 py-1 text-xs rounded hover:opacity-90 transition-opacity ${
            variant === 'error'
              ? 'bg-[var(--color-error)]/15 text-[var(--color-error)]'
              : 'bg-[var(--color-brand)] text-white'
          }`}>{confirmLabel}</button>
      </div>
    </div>
  )
}
