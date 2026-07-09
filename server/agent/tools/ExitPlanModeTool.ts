/**
 * ExitPlanModeTool — 退出计划模式（提交计划给用户审批）
 *
 * 参照 smart-code ExitPlanModeTool (V2)，简化版。
 * 将计划内容发送给前端，等待用户 approve/reject。
 */

import type { Tool, ToolResult, ToolContext, ToolInputJSONSchema } from './types'

export const EXIT_PLAN_MODE_TOOL_NAME = 'ExitPlanMode'

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    plan: {
      type: 'string',
      description: 'The plan to present to the user for approval. Should be a clear, structured description of what you intend to do.',
    },
  },
  required: ['plan'],
}

export const exitPlanModeTool: Tool = {
  name: EXIT_PLAN_MODE_TOOL_NAME,
  description: `Prompts the user to exit plan mode and start coding.

Present your plan for user approval. The plan should be clear and structured, describing:
- What changes you will make
- Which files you will modify
- The approach you will take

If the user approves, you can proceed with implementation. If rejected, adjust your plan based on feedback.`,
  inputSchema,
  async execute(input, context: ToolContext): Promise<ToolResult> {
    const plan = input.plan as string
    if (!plan || typeof plan !== 'string') {
      return { content: 'Error: plan is required', isError: true }
    }

    if (!context.askUser) {
      return { content: 'Error: user interaction is not available', isError: true }
    }

    const requestId = `plan-exit-${Date.now()}`

    try {
      const response = await context.askUser({
        id: requestId,
        kind: 'plan',
        plan,
      })

      if (response === 'approved') {
        return { content: 'Plan approved. You can now proceed with implementation.' }
      }
      return { content: `Plan rejected. User feedback: ${response || 'No feedback provided'}. Please revise your approach.` }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error exiting plan mode: ${msg}`, isError: true }
    }
  },
}
