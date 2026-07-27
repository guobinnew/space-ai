import { useState } from 'react'
import type { ScheduledTask } from '../../api/scheduled-tasks'
import { TaskRow } from './TaskRow'

type Props = { tasks: ScheduledTask[]; onRefresh: () => void }

export function TaskList({ tasks, onRefresh }: Props) {
  const enabledCount = tasks.filter((t) => t.enabled !== false).length
  const [expandedLogsId, setExpandedLogsId] = useState<string | null>(null)

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="px-4 py-3 rounded-xl bg-[var(--color-surface-container)]">
          <div className="text-2xl font-bold text-[var(--color-text-primary)]">{tasks.length}</div>
          <div className="text-xs text-[var(--color-text-secondary)]">总计</div>
        </div>
        <div className="px-4 py-3 rounded-xl bg-[var(--color-surface-container)]">
          <div className="text-2xl font-bold text-[var(--color-success)]">{enabledCount}</div>
          <div className="text-xs text-[var(--color-text-secondary)]">已启用</div>
        </div>
        <div className="px-4 py-3 rounded-xl bg-[var(--color-surface-container)]">
          <div className="text-2xl font-bold text-[var(--color-text-tertiary)]">{tasks.length - enabledCount}</div>
          <div className="text-xs text-[var(--color-text-secondary)]">已停用</div>
        </div>
      </div>

      {/* Task rows */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            showLogs={expandedLogsId === task.id}
            onToggleLogs={() => setExpandedLogsId(expandedLogsId === task.id ? null : task.id)}
            onRefresh={onRefresh}
          />
        ))}
      </div>
    </div>
  )
}
