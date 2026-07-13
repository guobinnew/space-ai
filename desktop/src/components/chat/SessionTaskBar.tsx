/**
 * SessionTaskBar — 会话任务栏
 *
 * 参照 smart-code chat/SessionTaskBar.tsx。
 * 当 LLM 通过 TaskCreate/TaskUpdate 工具输出任务清单时，在此组件中展示。
 * 通过 useTaskStore 轮询获取最新任务状态。
 */

import { useState } from 'react'
import { useTaskStore } from '../../stores/cliTaskStore'
import type { Task } from '../../types/task'
import type { TodoItem } from '../../types/chat'

const statusConfig = {
  pending: {
    color: 'var(--color-text-tertiary)',
  },
  in_progress: {
    color: 'var(--color-warning)',
  },
  completed: {
    color: 'var(--color-success)',
  },
  failed: {
    color: 'var(--color-error)',
    icon: 'x-circle',
  },
  cancelled: {
    color: 'var(--color-text-tertiary)',
    icon: 'slash',
  },
} as const

export function SessionTaskBar({ todos: liveTodos }: { todos?: TodoItem[] } = {}) {
  const {
    tasks: polledTasks,
    hasPending,
    dismissed,
    dismissCompleted,
    resetCompletedTasks,
    fetchSessionTasks,
  } = useTaskStore()
  const [expanded, setExpanded] = useState(true)

  // Merge polled tasks (from TaskCreate/Update) with live TodoWrite todos
  const tasks: (Task | TodoItem)[] = polledTasks.length > 0
    ? polledTasks
    : (liveTodos || [])

  if (tasks.length === 0) return null

  const allCompleted = tasks.every((tk) =>
    tk.status === 'completed' || tk.status === 'cancelled' || tk.status === 'failed'
  )
  if (allCompleted && dismissed) return null

  const completedCount = tasks.filter((tk) => tk.status === 'completed').length
  const totalCount = tasks.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <div className="shrink-0 px-4">
      <div className="mx-auto max-w-3xl rounded-xl border border-[var(--color-outline-variant)]/40 bg-[var(--color-surface-container-lowest)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 bg-[var(--color-surface-container)] px-2 py-1.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1 hover:bg-[var(--color-surface-container-low)] transition-colors"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-[var(--color-secondary)]/10">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-secondary)]">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>

            <span className="text-xs font-semibold text-[var(--color-text-primary)]">
              任务清单
            </span>

            {/* Progress bar */}
            <div className="flex-1 h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden max-w-[200px]">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: allCompleted
                    ? 'var(--color-success)'
                    : 'var(--color-brand)',
                }}
              />
            </div>

            <span className="text-[10px] text-[var(--color-text-tertiary)] tabular-nums">
              {completedCount}/{totalCount}
            </span>

            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--color-text-tertiary)] transition-transform duration-200"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {allCompleted && (
            <button
              type="button"
              aria-label="关闭已完成任务"
              onClick={() => dismissCompleted()}
              className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-container-low)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Expanded task list */}
        {expanded && (
          <div className="px-4 pb-2 pt-1 flex flex-col gap-0.5 max-h-[240px] overflow-y-auto border-t border-[var(--color-outline-variant)]/20">
            {tasks.map((task, idx) => (
              <TaskItem key={'id' in task ? task.id : String(idx)} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const isTask = (t: Task | TodoItem): t is Task => 'subject' in t

function TaskItem({ task }: { task: Task | TodoItem }) {
  const config = statusConfig[task.status]
  const taskName = isTask(task) ? task.subject : task.content
  const taskId = isTask(task) ? task.id : '#'

  return (
    <div className="flex items-start gap-2 py-1.5 px-1 rounded-md">
      {/* Status icon */}
      {task.status === 'completed' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ) : task.status === 'in_progress' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ) : task.status === 'failed' || task.status === 'cancelled' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0">
          <circle cx="12" cy="12" r="10" />
        </svg>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-[var(--color-text-tertiary)]">
            #{taskId}
          </span>
          <span className={`text-xs ${
            task.status === 'completed'
              ? 'text-[var(--color-text-tertiary)] line-through'
              : 'text-[var(--color-text-primary)]'
          }`}>
            {taskName}
          </span>
          {isTask(task) && task.priority && task.priority !== 'medium' && (
            <span className={`text-[9px] px-1 py-0.5 rounded ${
              task.priority === 'high' ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]' : 'text-[var(--color-text-tertiary)]'
            }`}>
              {task.priority}
            </span>
          )}
        </div>

        {task.status === 'in_progress' && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] animate-pulse" />
            <span className="text-[10px] text-[var(--color-warning)]">
              进行中...
            </span>
          </div>
        )}

        {isTask(task) && task.body && (
          <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5 line-clamp-2">
            {task.body}
          </p>
        )}
      </div>
    </div>
  )
}
