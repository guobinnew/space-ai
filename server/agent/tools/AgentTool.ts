/**
 * Agent Tool — 智能体工具
 *
 * 允许 LLM 调用子代理来执行特定任务。
 * 参照 smart-code AgentTool 简化实现。
 */

import type { Tool, ToolResult, ToolContext } from './types'
import { getAgent, listAllAgents } from '../services/agentService'
import { runSubAgent } from '../services/subAgentRunner'

const DESCRIPTION = `Launch a new agent to handle complex, multi-step tasks autonomously.

Available agent types:
- Explore: Fast agent for exploring codebases, finding files, searching code
- Plan: Software architect agent for designing implementation plans
- General: General-purpose agent for researching complex questions and executing multi-step tasks

When using this tool, specify the agentType and provide a detailed prompt describing the task.`

export const agentTool: Tool = {
  name: 'Agent',
  description: DESCRIPTION,
  inputSchema: {
    type: 'object',
    properties: {
      agentType: {
        type: 'string',
        description: 'The type of agent to launch (e.g. "Explore", "Plan", "general-purpose")',
      },
      prompt: {
        type: 'string',
        description: 'The detailed task description for the agent to perform',
      },
    },
    required: ['agentType', 'prompt'],
  },

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const agentType = String(input.agentType ?? '')
    const prompt = String(input.prompt ?? '')

    if (!agentType) {
      return { content: 'Error: agentType is required', isError: true }
    }
    if (!prompt) {
      return { content: 'Error: prompt is required', isError: true }
    }

    const agent = await getAgent(agentType)
    if (!agent) {
      const available = (await listAllAgents()).map((a) => a.agentType).join(', ')
      return {
        content: `Error: Agent '${agentType}' not found. Available agents: ${available}`,
        isError: true,
      }
    }

    try {
      const result = await runSubAgent(agent, prompt, context)
      return {
        content: result.text || '(子代理未返回内容)',
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `子代理执行失败: ${msg}`, isError: true }
    }
  },
}
