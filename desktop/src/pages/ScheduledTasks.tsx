/**
 * 定时任务管理页（参照 smart-code 复刻）
 */
import { useEffect, useState, useCallback } from 'react'
import { fetchScheduledTasks, type ScheduledTask } from '../api/scheduled-tasks'
import { TaskList } from '../components/tasks/TaskList'
import { TaskEmptyState } from '../components/tasks/TaskEmptyState'
import { NewTaskModal } from '../components/tasks/NewTaskModal'

export function ScheduledTasksPage() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const ts = await fetchScheduledTasks()
      setTasks(ts)
      setInitialized(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-10 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">定时任务</h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              使用 <code className="px-1 py-0.5 rounded bg-[var(--color-surface-container)] text-xs font-mono">/schedule</code> 指令创建定时任务
            </p>
          </div>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--color-brand)] text-white hover:opacity-90 transition-opacity"
          >
            新建任务
          </button>
        </div>

        {/* Desktop-online notice */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-[var(--color-warning)]/8 border border-[var(--color-warning)]/15 mb-6">
          <svg className="w-[18px] h-[18px] text-[var(--color-warning)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-[var(--color-text-secondary)]">
            定时任务通过后台调度执行。请确保应用在后台运行。
          </span>
        </div>

        {/* Content */}
        {!initialized && loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-6 h-6 border-2 border-[var(--color-brand)] border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <svg className="w-10 h-10 text-[var(--color-text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
            <p className="text-sm text-[var(--color-text-secondary)]">{error}</p>
            <button onClick={load}
              className="px-4 py-2 rounded-lg text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-container)] transition-colors"
            >
              重试
            </button>
          </div>
        ) : tasks.length === 0 ? (
          <TaskEmptyState onCreateTask={() => setShowForm(true)} />
        ) : (
          <TaskList tasks={tasks} onRefresh={load} />
        )}
      </div>

      {showForm && (
        <NewTaskModal open onClose={() => { setShowForm(false); load() }} />
      )}
    </div>
  )
}
