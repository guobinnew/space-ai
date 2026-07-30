/**
 * EnterPlanModeTool — 进入计划模式
 *
 * 参照 smart-code EnterPlanModeTool，简化版。
 * 通知前端进入计划模式（用户审批后继续探索和设计）。
 */

import type { Tool, ToolResult, ToolContext, ToolInputJSONSchema } from './types'

export const ENTER_PLAN_MODE_TOOL_NAME = 'EnterPlanMode'

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {},
}

export const enterPlanModeTool: Tool = {
  name: ENTER_PLAN_MODE_TOOL_NAME,
  description: `Requests permission to enter plan mode for complex tasks requiring exploration and design.

Use this tool when:
- The task is complex and requires careful planning before execution
- You need to explore the codebase and design an approach before making changes
- The user's request involves multiple steps that should be reviewed

After entering plan mode, you should explore the codebase, design a plan, and then use ExitPlanMode to present the plan for approval before making any changes.`,
  inputSchema,
  async execute(_input, context: ToolContext): Promise<ToolResult> {
    if (!context.askUser) {
      return { content: 'Error: user interaction is not available', isError: true }
    }

    const requestId = `plan-enter-${Date.now()}`

    try {
      const response = await context.askUser({
        id: requestId,
        kind: 'plan',
        plan: '__ENTER_PLAN_MODE__',
      })

      if (response === 'approved') {
        return { content: 'Plan mode entered. You can now explore the codebase and design your approach. Use ExitPlanMode when ready to present your plan.' }
      }
      return { content: 'User declined to enter plan mode. Proceed with direct execution.' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error entering plan mode: ${msg}`, isError: true }
    }
  },
}
