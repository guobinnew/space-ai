/**
 * TaskUpdateTool — 更新任务状态或属性
 *
 * Agent 调用此工具更新任务的 status、body、priority 等。
 * 用于标记任务开始执行、完成、失败等。
 */

import type { Tool, ToolResult, ToolContext, ToolInputJSONSchema } from './types'
import { updateTask } from '../services/taskService'
import type { TaskStatus } from '../types/task'

export const TASK_UPDATE_TOOL_NAME = 'TaskUpdate'

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    taskId: {
      type: 'string',
      description: '要更新的任务 ID',
    },
    status: {
      type: 'string',
      enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
      description: '新的状态。in_progress = 正在执行, completed = 完成, failed = 失败',
    },
    body: {
      type: 'string',
      description: '补充说明或执行结果（可选）',
    },
    priority: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
      description: '更新优先级（可选）',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: '更新标签（可选）',
    },
  },
  required: ['taskId'],
}

export const taskUpdateTool: Tool = {
  name: TASK_UPDATE_TOOL_NAME,
  description: `Update a task's status or properties. Use this to mark tasks as in_progress when starting work, and completed/failed when done. The desktop UI will reflect status changes in real-time via polling.

Example:
  { "taskId": "1", "status": "in_progress" }
  { "taskId": "1", "status": "completed", "body": "Fixed the bug by updating validation logic" }

Note: After marking a task as completed, if there are more pending tasks, the system will automatically continue with the next one.`,
  inputSchema,
  async execute(input, context: ToolContext): Promise<ToolResult> {
    const taskId = input.taskId as string
    const updates: Record<string, unknown> = {}
    if (input.status !== undefined) updates.status = input.status
    if (input.body !== undefined) updates.body = input.body
    if (input.priority !== undefined) updates.priority = input.priority
    if (input.tags !== undefined) updates.tags = input.tags

    const task = await updateTask(context.sessionId, taskId, updates)
    if (!task) {
      return { content: `Error: Task #${taskId} not found`, isError: true }
    }
    return {
      content: `Task #${task.id} updated: ${task.status} — ${task.subject}`,
    }
  },
}
