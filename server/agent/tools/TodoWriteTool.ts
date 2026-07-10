/**
 * TodoWriteTool — 任务列表管理
 *
 * 参照 smart-code TodoWriteTool，简化版。
 * 在内存中按 session 维护 todo 列表，支持 pending/in_progress/completed 状态。
 */

import type { Tool, ToolResult, ToolContext, ToolInputJSONSchema } from './types'
import { saveTasks } from '../services/taskService'

export const TODO_WRITE_TOOL_NAME = 'TodoWrite'

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    todos: {
      type: 'array',
      description: 'The updated todo list',
      items: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The task content (imperative form, e.g. "Add login page")',
          },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed'],
            description: 'The current status of the task',
          },
          activeForm: {
            type: 'string',
            description: 'The present continuous form (e.g. "Adding login page")',
          },
        },
        required: ['content', 'status', 'activeForm'],
      },
    },
  },
  required: ['todos'],
}

interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string
}

/** 按 sessionId 存储的 todo 列表 */
const sessionTodos = new Map<string, TodoItem[]>()

export const todoWriteTool: Tool = {
  name: TODO_WRITE_TOOL_NAME,
  description: `Update the todo list for the current session. To be used proactively and often to track progress and pending tasks. Make sure at least one task is in_progress at all times. Always provide both content (imperative) and activeForm (present continuous) for each task.

Example:
todos: [
  { content: "Read config file", status: "completed", activeForm: "Reading config file" },
  { content: "Add validation logic", status: "in_progress", activeForm: "Adding validation logic" },
  { content: "Write tests", status: "pending", activeForm: "Writing tests" }
]`,
  inputSchema,
  async execute(input, context: ToolContext): Promise<ToolResult> {
    const todos = input.todos as TodoItem[]
    if (!Array.isArray(todos)) {
      return { content: 'Error: todos must be an array', isError: true }
    }

    // Validate each todo item
    for (const todo of todos) {
      if (!todo.content || typeof todo.content !== 'string') {
        return { content: 'Error: each todo must have a non-empty content', isError: true }
      }
      if (!todo.status || !['pending', 'in_progress', 'completed'].includes(todo.status)) {
        return { content: `Error: invalid status "${todo.status}"`, isError: true }
      }
      if (!todo.activeForm || typeof todo.activeForm !== 'string') {
        return { content: 'Error: each todo must have a non-empty activeForm', isError: true }
      }
    }

    // Store in session map
    sessionTodos.set(context.sessionId, todos)

    // Persist to disk
    await saveTasks(context.sessionId, todos).catch(() => {
      // Ignore persistence errors — memory still works
    })

    // Format summary
    const summary = todos
      .map((t, i) => {
        const icon = t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[~]' : '[ ]'
        return `${i + 1}. ${icon} ${t.content}`
      })
      .join('\n')

    const counts = {
      pending: todos.filter((t) => t.status === 'pending').length,
      in_progress: todos.filter((t) => t.status === 'in_progress').length,
      completed: todos.filter((t) => t.status === 'completed').length,
    }

    return {
      content: `Todo list updated (${counts.completed}/${todos.length} completed, ${counts.in_progress} in progress, ${counts.pending} pending):\n${summary}`,
    }
  },
}

/** 获取 session 的 todo 列表（供其他模块使用） */
export function getSessionTodos(sessionId: string): TodoItem[] {
  return sessionTodos.get(sessionId) || []
}
