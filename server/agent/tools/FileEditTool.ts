/**
 * FileEditTool — 精确字符串替换
 *
 * 参照 smart-code FileEditTool，简化版。
 * 在文件中执行 old_string → new_string 的精确替换。
 * 支持 replace_all 替换所有匹配。
 */

import * as fs from 'fs/promises'
import type { Tool, ToolResult, ToolInputJSONSchema } from './types'
import { FILE_EDIT_TOOL_NAME } from '../constants/prompts'

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    file_path: {
      type: 'string',
      description: 'The absolute path to the file to modify',
    },
    old_string: {
      type: 'string',
      description: 'The text to replace',
    },
    new_string: {
      type: 'string',
      description: 'The text to replace it with (must be different from old_string)',
    },
    replace_all: {
      type: 'boolean',
      description: 'Replace all occurrences of old_string (default false)',
      default: false,
    },
  },
  required: ['file_path', 'old_string', 'new_string'],
}

export const fileEditTool: Tool = {
  name: FILE_EDIT_TOOL_NAME,
  description: `Performs exact string replacements in files.

Usage:
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. Never include any part of the line number prefix in old_string or new_string.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if old_string is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use replace_all to change every instance of old_string.
- Use replace_all for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.`,
  inputSchema,
  async execute(input): Promise<ToolResult> {
    const filePath = input.file_path as string
    const oldString = input.old_string as string
    const newString = input.new_string as string
    const replaceAll = input.replace_all === true

    if (!filePath) {
      return { content: 'Error: file_path is required', isError: true }
    }
    if (oldString === undefined || newString === undefined) {
      return { content: 'Error: old_string and new_string are required', isError: true }
    }
    if (oldString === newString) {
      return { content: 'Error: new_string must be different from old_string', isError: true }
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8')

      // Check occurrences
      const occurrences = countOccurrences(content, oldString)
      if (occurrences === 0) {
        return {
          content: `Error: old_string not found in file. Make sure the string matches exactly, including whitespace and indentation.`,
          isError: true,
        }
      }

      if (!replaceAll && occurrences > 1) {
        return {
          content: `Error: old_string is not unique in the file (${occurrences} occurrences). Provide more surrounding context to make it unique, or set replace_all=true.`,
          isError: true,
        }
      }

      // Perform replacement
      let newContent: string
      if (replaceAll) {
        newContent = content.split(oldString).join(newString)
      } else {
        // Replace first occurrence only
        const idx = content.indexOf(oldString)
        newContent = content.slice(0, idx) + newString + content.slice(idx + oldString.length)
      }

      await fs.writeFile(filePath, newContent, 'utf-8')

      const replaced = replaceAll ? occurrences : 1
      return {
        content: `Successfully edited ${filePath} (${replaced} replacement${replaced > 1 ? 's' : ''})`,
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        return { content: `File not found: ${filePath}`, isError: true }
      }
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error editing file: ${msg}`, isError: true }
    }
  },
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let idx = haystack.indexOf(needle)
  while (idx !== -1) {
    count++
    idx = haystack.indexOf(needle, idx + needle.length)
  }
  return count
}
