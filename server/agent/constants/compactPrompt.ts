/**
 * 上下文压缩（auto-compact）提示词与摘要格式化。
 * 参考 smart-code src/services/compact/prompt.ts 简化版：仅保留基础全量压缩，
 * 去掉 partial/proactive/feature-flag 等分支。
 */

const NO_TOOLS_PREAMBLE = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.

- Do NOT use Read, Bash, Grep, Glob, Edit, Write, or ANY other tool.
- You already have all the context you need in the conversation above.
- Tool calls will be REJECTED and will waste your only turn — you will fail the task.
- Your entire response must be plain text: an <analysis> block followed by a <summary> block.

`

const DETAILED_ANALYSIS_INSTRUCTION = `Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Chronologically analyze each message and section of the conversation. For each section thoroughly identify:
   - the user's explicit requests and intents
   - your approach to addressing the user's requests
   - key decisions, technical concepts and code patterns
   - specific details like file names, full code snippets, function signatures, file edits
   - errors that you ran into and how you fixed them
   - pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.`

const BASE_COMPACT_PROMPT = `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.

${DETAILED_ANALYSIS_INSTRUCTION}

Your summary should include the following sections:

1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Pay special attention to the most recent messages and include full code snippets where applicable and include a summary of why this file read or edit is important.
4. Errors and fixes: List all errors that you ran into, and how you fixed them. Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages that are not tool results. These are critical for understanding the user's feedback and changing intent.
7. Pending Tasks: Outline any pending tasks that you have explicitly been asked to work on.
8. Current Work: Describe in detail precisely what was being worked on immediately before this summary request, paying special attention to the most recent messages from both user and assistant. Include file names and code snippets where applicable.
9. Optional Next Step: List the next step that you will take that is directly in line with the user's most recent explicit requests. If there is a next step, include direct quotes from the most recent conversation showing exactly what task you were working on and where you left off.

Respond with an <analysis> block followed by a <summary> block.`

const NO_TOOLS_TRAILER =
  '\n\nREMINDER: Do NOT call any tools. Respond with plain text only — ' +
  'an <analysis> block followed by a <summary> block.'

const COMPACT_SYSTEM_PROMPT =
  'You are a helpful assistant that creates detailed summaries of conversations.'

export function getCompactSystemPrompt(): string {
  return COMPACT_SYSTEM_PROMPT
}

export function getCompactPrompt(): string {
  return NO_TOOLS_PREAMBLE + BASE_COMPACT_PROMPT + NO_TOOLS_TRAILER
}

/**
 * 格式化压缩摘要：剥离 <analysis> 草稿区，保留 <summary> 内容。
 */
export function formatCompactSummary(summary: string): string {
  let formatted = summary
  // Strip analysis section — drafting scratchpad, no informational value once written.
  // 使用 g flag 剥离所有 analysis 块
  formatted = formatted.replace(/<analysis>[\s\S]*?<\/analysis>/g, '')
  // Extract and format summary section.
  const summaryMatch = formatted.match(/<summary>([\s\S]*?)<\/summary>/)
  if (summaryMatch) {
    const content = summaryMatch[1] || ''
    formatted = formatted.replace(
      /<summary>[\s\S]*?<\/summary>/,
      `Summary:\n${content.trim()}`,
    )
  }
  // Clean up extra whitespace.
  formatted = formatted.replace(/\n\n+/g, '\n\n')
  return formatted.trim()
}

/**
 * 构造压缩后的用户消息：标记"会话从上一段延续"，内嵌格式化后的摘要。
 */
export function getCompactUserSummaryMessage(summary: string): string {
  const formatted = formatCompactSummary(summary)
  return (
    'This session is being continued from a previous conversation that ran out of context. ' +
    'The summary below covers the earlier portion of the conversation.\n\n' +
    formatted +
    '\n\nContinue the conversation from where it left off. Resume directly — do not acknowledge ' +
    'the summary, do not recap what was happening. Pick up the last task as if the break never happened.'
  )
}
