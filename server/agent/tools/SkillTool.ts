/**
 * SkillTool — 执行技能
 *
 * 参照 smart-code SkillTool，简化版。
 * 加载技能的 SKILL.md 内容返回给 LLM，LLM 根据技能指令执行任务。
 * 技能从 ~/.spaceai/skills/<name>/SKILL.md 加载。
 */

import { skillService } from '../services/skillService'
import type { Tool, ToolResult, ToolInputJSONSchema } from './types'

export const SKILL_TOOL_NAME = 'Skill'

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    skill: {
      type: 'string',
      description: 'The name of the skill to invoke (e.g. "code-review", "tdd")',
    },
    args: {
      type: 'string',
      description: 'Optional arguments to pass to the skill',
    },
  },
  required: ['skill'],
}

export const skillTool: Tool = {
  name: SKILL_TOOL_NAME,
  description: `Execute a skill within the main conversation.

When users ask you to perform tasks, check if any of the available skills match. Skills provide specialized capabilities and domain knowledge.

When users reference a "slash command" or "/<something>" (e.g., "/commit", "/review"), they are referring to a skill. Use this tool to invoke it.

How to invoke:
- Use this tool with the skill name and optional arguments
- Examples:
  - \`skill: "pdf"\` — invoke the pdf skill
  - \`skill: "commit", args: "-m 'Fix bug'"\` — invoke with arguments

Important:
- Available skills are listed in the system prompt under "Available skills"
- When a skill matches the user's request, invoke the relevant Skill tool BEFORE generating any other response
- NEVER mention a skill without actually calling this tool
- Do not invoke a skill that is already running
- The skill content will be returned as the tool result — follow the instructions in it to complete the task`,
  inputSchema,
  async execute(input): Promise<ToolResult> {
    const skillName = input.skill as string
    const args = input.args as string | undefined

    if (!skillName || typeof skillName !== 'string') {
      return { content: 'Error: skill name is required', isError: true }
    }

    try {
      const skill = await skillService.getSkill(skillName)

      // 返回技能内容给 LLM（含 basePath 供访问技能资源）
      let result = `# Skill: ${skill.name}\n\n${skill.description ? `**Description:** ${skill.description}\n\n` : ''}`

      result += `**Base directory for this skill:** ${skill.basePath}\n\n`

      if (args) {
        result += `**Arguments:** ${args}\n\n`
      }

      result += `---\n\n${skill.content || '(No additional instructions)'}`

      return { content: result }
    } catch {
      return {
        content: `Error: skill "${skillName}" not found. Check available skills in the system prompt.`,
        isError: true,
      }
    }
  },
}
