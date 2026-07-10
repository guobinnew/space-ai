/**
 * TaskCreateTool — 创建任务
 *
 * Agent 调用此工具创建新任务，任务会持久化到磁盘并在前端 SessionTaskBar 中显示。
 */

import type { Tool, ToolResult, ToolContext, ToolInputJSONSchema } from './types'
import { createTask } from '../services/taskService'

export const TASK_CREATE_TOOL_NAME = 'TaskCreate'

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    subject: {
      type: 'string',
      description: '任务描述（命令式，如 "修复登录页bug"）',
    },
    body: {
      type: 'string',
      description: '补充说明（可选）',
    },
    priority: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
      description: '优先级，默认 medium',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: '标签列表（可选）',
    },
  },
  required: ['subject'],
}

export const taskCreateTool: Tool = {
  name: TASK_CREATE_TOOL_NAME,
  description: `Create a new task for the current session. Tasks appear in the task bar on the desktop UI with progress tracking. Always create tasks when starting multi-step work.

Example:
  { "subject": "Add login page", "priority": "high", "tags": ["frontend"] }

Returns the created task with its assigned ID.`,
  inputSchema,
  async execute(input, context: ToolContext): Promise<ToolResult> {
    const task = await createTask(context.sessionId, {
      subject: input.subject as string,
      body: input.body as string | undefined,
      priority: input.priority as 'low' | 'medium' | 'high' | undefined,
      tags: input.tags as string[] | undefined,
    })
    return {
      content: `Task #${task.id} created: ${task.subject} (${task.priority} priority)`,
    }
  },
}
