/**
 * AskUserQuestionTool — 向用户提问
 *
 * 参照 smart-code AskUserQuestionTool，简化版。
 * 通过 askUser 回调将问题发送给前端，等待用户选择后返回。
 */

import type { Tool, ToolResult, ToolContext, ToolInputJSONSchema } from './types'

export const ASK_USER_QUESTION_TOOL_NAME = 'AskUserQuestion'

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      description: 'Questions to ask the user (1-4 questions)',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The complete question to ask the user. Should be clear, specific, and end with a question mark.',
          },
          header: {
            type: 'string',
            description: 'Very short label displayed as a chip/tag (max 12 chars). Examples: "Auth method", "Library", "Approach".',
          },
          options: {
            type: 'array',
            description: 'The available choices for this question (2-4 options).',
            minItems: 2,
            maxItems: 4,
            items: {
              type: 'object',
              properties: {
                label: {
                  type: 'string',
                  description: 'The display text for this option (1-5 words).',
                },
                description: {
                  type: 'string',
                  description: 'Explanation of what this option means or what will happen if chosen.',
                },
              },
              required: ['label', 'description'],
            },
          },
          multiSelect: {
            type: 'boolean',
            description: 'Set to true to allow the user to select multiple options.',
            default: false,
          },
        },
        required: ['question', 'header', 'options'],
      },
    },
  },
  required: ['questions'],
}

export const askUserQuestionTool: Tool = {
  name: ASK_USER_QUESTION_TOOL_NAME,
  description: `Asks the user multiple choice questions to gather information, clarify ambiguity, understand preferences, make decisions or offer them choices.

Use this tool when:
- You need clarification on an ambiguous request
- The user has a choice to make between approaches
- You need to understand the user's preferences

Each question has 2-4 options. There should be no "Other" option — that is provided automatically.

IMPORTANT: Use this tool sparingly — only when genuinely stuck after investigation, not as a first response to friction.`,
  inputSchema,
  async execute(input, context: ToolContext): Promise<ToolResult> {
    const questions = input.questions
    if (!Array.isArray(questions) || questions.length === 0) {
      return { content: 'Error: questions array is required', isError: true }
    }

    if (!context.askUser) {
      return { content: 'Error: user interaction is not available in this context', isError: true }
    }

    const requestId = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    try {
      // Send questions to frontend and wait for answer
      const answerJson = await context.askUser({
        id: requestId,
        kind: 'question',
        questions,
      })

      if (!answerJson) {
        return { content: 'User cancelled the question.', isError: true }
      }

      // Parse and format the answer
      try {
        const answers = JSON.parse(answerJson) as Record<string, string>
        const formatted = Object.entries(answers)
          .map(([q, a]) => `Q: ${q}\nA: ${a}`)
          .join('\n\n')
        return { content: formatted || 'No answers provided.' }
      } catch {
        return { content: answerJson }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error asking user: ${msg}`, isError: true }
    }
  },
}
