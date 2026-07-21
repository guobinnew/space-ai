/**
 * CLI Task Store — 任务状态管理
 *
 * 通过 REST API 与服务器的任务持久化双向同步。
 */

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'
import { tasksApi } from '../api/tasks'
import type { Task } from '../types/task'

/** JSON-stable task data snapshot used to skip re-renders when nothing changed. */
type TaskSnapshot = { tasks: Task[]; hasPending: boolean; nextPending: Task | null }

interface TaskStoreState {
  tasks: Task[]
  hasPending: boolean
  nextPending: Task | null
  dismissed: boolean
  fetchSessionTasks: (sessionId: string) => Promise<void>
  clearTasks: () => void
  dismissCompleted: () => void
  resetCompletedTasks: (sessionId: string) => Promise<void>
}

const TaskContext = createContext<TaskStoreState | null>(null)

export function TaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [hasPending, setHasPending] = useState(false)
  const [nextPending, setNextPending] = useState<Task | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const lastSessionRef = useRef<string | null>(null)
  /** Cached snapshot to avoid React re-renders when task data hasn't changed. */
  const lastSnapshotRef = useRef<TaskSnapshot>({ tasks: [], hasPending: false, nextPending: null })

  const fetchSessionTasks = useCallback(async (sessionId: string) => {
    const isNewSession = lastSessionRef.current !== sessionId
    if (isNewSession) {
      lastSessionRef.current = sessionId
      setDismissed(false)
    }
    try {
      const data = await tasksApi.list(sessionId)
      const snapshot: TaskSnapshot = { tasks: data.tasks, hasPending: data.hasPending, nextPending: data.nextPending }

      // Skip update if data hasn't changed — prevents unnecessary re-renders from polling
      if (!isNewSession && JSON.stringify(lastSnapshotRef.current) === JSON.stringify(snapshot)) {
        return
      }

      lastSnapshotRef.current = snapshot
      // Atomically replace all task state — no intermediate empty state,
      // so SessionTaskBar won't flash hide→show.
      setTasks(data.tasks)
      setHasPending(data.hasPending)
      setNextPending(data.nextPending)
    } catch {
      // Only clear on error (e.g. server not ready yet)
      if (isNewSession) {
        lastSnapshotRef.current = { tasks: [], hasPending: false, nextPending: null }
        setTasks([])
        setHasPending(false)
        setNextPending(null)
      }
    }
  }, [])

  const clearTasks = useCallback(() => {
    lastSnapshotRef.current = { tasks: [], hasPending: false, nextPending: null }
    setTasks([])
    setHasPending(false)
    setNextPending(null)
    setDismissed(false)
  }, [])

  const dismissCompleted = useCallback(() => {
    setDismissed(true)
  }, [])

  const resetCompletedTasks = useCallback(async (sessionId: string) => {
    try {
      await tasksApi.reset(sessionId)
    } catch {
      // Ignore
    }
    lastSnapshotRef.current = { tasks: [], hasPending: false, nextPending: null }
    setTasks([])
    setHasPending(false)
    setNextPending(null)
    setDismissed(true)
  }, [])

  return (
    <TaskContext.Provider
      value={{
        tasks,
        hasPending,
        nextPending,
        dismissed,
        fetchSessionTasks,
        clearTasks,
        dismissCompleted,
        resetCompletedTasks,
      }}
    >
      {children}
    </TaskContext.Provider>
  )
}

export function useTaskStore(): TaskStoreState {
  const ctx = useContext(TaskContext)
  if (!ctx) throw new Error('useTaskStore must be used within TaskProvider')
  return ctx
}
