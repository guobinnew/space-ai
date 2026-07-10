/**
 * CLI Task Store — 任务状态管理
 *
 * 通过 REST API 与服务器的任务持久化双向同步。
 */

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'
import { tasksApi } from '../api/tasks'
import type { Task } from '../types/task'

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

  const fetchSessionTasks = useCallback(async (sessionId: string) => {
    if (lastSessionRef.current !== sessionId) {
      setTasks([])
      setHasPending(false)
      setNextPending(null)
      setDismissed(false)
      lastSessionRef.current = sessionId
    }
    try {
      const data = await tasksApi.list(sessionId)
      setTasks(data.tasks)
      setHasPending(data.hasPending)
      setNextPending(data.nextPending)
    } catch {
      // Server may not be available
    }
  }, [])

  const clearTasks = useCallback(() => {
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
