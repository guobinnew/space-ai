/**
 * CLI Task Store — 任务状态管理
 *
 * 通过 REST API 与服务器的任务持久化双向同步。
 */

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'
import { tasksApi } from '../api/tasks'
import type { Task } from '../types/task'

/** Stable display order: by numeric id ascending. The server returns tasks sorted
 *  by `updatedAt` desc, which reshuffles the list every time a task is touched and
 *  causes the visible flicker. Sorting here keeps the order fixed. */
function sortTasksById(tasks: Task[]): Task[] {
  return tasks
    .slice()
    .sort((a, b) => (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0))
}

/** JSON-stable task data snapshot used to skip re-renders when nothing changed. */
type TaskSnapshot = { tasks: Task[]; hasPending: boolean; nextPending: Task | null }

interface TaskStoreState {
  tasks: Task[]
  hasPending: boolean
  nextPending: Task | null
  fetchSessionTasks: (sessionId: string) => Promise<{ tasks: Task[]; hasPending: boolean; nextPending: Task | null } | null>
  clearTasks: (sessionId: string) => Promise<void>
}

const TaskContext = createContext<TaskStoreState | null>(null)

export function TaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [hasPending, setHasPending] = useState(false)
  const [nextPending, setNextPending] = useState<Task | null>(null)
  const lastSessionRef = useRef<string | null>(null)
  /** Cached snapshot to avoid React re-renders when task data hasn't changed. */
  const lastSnapshotRef = useRef<TaskSnapshot>({ tasks: [], hasPending: false, nextPending: null })

  const fetchSessionTasks = useCallback(async (sessionId: string) => {
    const isNewSession = lastSessionRef.current !== sessionId
    if (isNewSession) {
      lastSessionRef.current = sessionId
    }
    try {
      const data = await tasksApi.list(sessionId)
      const sortedTasks = sortTasksById(data.tasks)

      // Defensive: a transient empty response mid-session (e.g. a momentary read
      // race on the server) must not blank out the bar and cause a flash.
      if (!isNewSession && sortedTasks.length === 0 && lastSnapshotRef.current.tasks.length > 0) {
        return data
      }

      const snapshot: TaskSnapshot = { tasks: sortedTasks, hasPending: data.hasPending, nextPending: data.nextPending }

      // Skip update if data hasn't changed — prevents unnecessary re-renders from polling
      if (!isNewSession && JSON.stringify(lastSnapshotRef.current) === JSON.stringify(snapshot)) {
        return data
      }

      lastSnapshotRef.current = snapshot
      // Atomically replace all task state — no intermediate empty state,
      // so SessionTaskBar won't flash hide→show.
      setTasks(sortedTasks)
      setHasPending(data.hasPending)
      setNextPending(data.nextPending)
      return data
    } catch {
      // Only clear on error (e.g. server not ready yet)
      if (isNewSession) {
        lastSnapshotRef.current = { tasks: [], hasPending: false, nextPending: null }
        setTasks([])
        setHasPending(false)
        setNextPending(null)
      }
      return null
    }
  }, [])

  /** 清空任务清单：删除服务端持久化数据并重置前端状态。 */
  const clearTasks = useCallback(async (sessionId: string) => {
    try {
      await tasksApi.reset(sessionId)
    } catch {
      // Ignore — still clear local state even if the server request fails
    }
    lastSnapshotRef.current = { tasks: [], hasPending: false, nextPending: null }
    setTasks([])
    setHasPending(false)
    setNextPending(null)
  }, [])

  return (
    <TaskContext.Provider
      value={{
        tasks,
        hasPending,
        nextPending,
        fetchSessionTasks,
        clearTasks,
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
