/**
 * TaskListTool — 列出当前会话的所有任务
 *
 * Agent 调用此工具查看当前任务列表，了解哪些任务已完成、进行中或待处理。
 */

import type { Tool, ToolResult, ToolContext, ToolInputJSONSchema } from './types'
import { listTasks } from '../services/taskService'

export const TASK_LIST_TOOL_NAME = 'TaskList'

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {},
  required: [],
}

export const taskListTool: Tool = {
  name: TASK_LIST_TOOL_NAME,
  description: `List all tasks for the current session, sorted by most recently updated. Use this to see what tasks exist and their current status.

Returns a formatted list of tasks with IDs, status, priority, and subject.`,
  inputSchema,
  async execute(_input, context: ToolContext): Promise<ToolResult> {
    const tasks = await listTasks(context.sessionId)
    if (tasks.length === 0) {
      return { content: 'No tasks created yet.' }
    }

    const lines = tasks.map((t) => {
      const icon = t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[~]' : '[ ]'
      const tagStr = t.tags.length > 0 ? ` (${t.tags.join(', ')})` : ''
      return `${icon} #${t.id} [${t.priority}] ${t.subject}${tagStr} — ${t.status}`
    })
    const counts = {
      pending: tasks.filter((t) => t.status === 'pending').length,
      in_progress: tasks.filter((t) => t.status === 'in_progress').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
    }
    return {
      content: `Tasks (${counts.completed}/${tasks.length} completed, ${counts.in_progress} in progress, ${counts.pending} pending):\n${lines.join('\n')}`,
    }
  },
}
