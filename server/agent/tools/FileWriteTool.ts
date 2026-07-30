/**
 * FileWriteTool — 写入文件
 *
 * 参照 smart-code FileWriteTool，简化版。
 * 将内容写入文件（覆盖已存在文件）。
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { Tool, ToolResult, ToolInputJSONSchema } from './types'
import { FILE_WRITE_TOOL_NAME } from '../constants/prompts'

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    file_path: {
      type: 'string',
      description: 'The absolute path to the file to write (must be absolute, not relative)',
    },
    content: {
      type: 'string',
      description: 'The content to write to the file',
    },
  },
  required: ['file_path', 'content'],
}

export const fileWriteTool: Tool = {
  name: FILE_WRITE_TOOL_NAME,
  description: `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- Prefer the Edit tool for modifying existing files — it only sends the diff. Only use this tool to create new files or for complete rewrites.
- NEVER create documentation files (*.md) or README files unless explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.`,
  inputSchema,
  async execute(input): Promise<ToolResult> {
    const filePath = input.file_path as string
    const content = input.content as string

    if (!filePath) {
      return { content: 'Error: file_path is required', isError: true }
    }
    if (content === undefined || content === null) {
      return { content: 'Error: content is required', isError: true }
    }

    try {
      // Ensure parent directory exists
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })

      await fs.writeFile(filePath, content, 'utf-8')

      const lineCount = content.split('\n').length
      return { content: `Successfully wrote to ${filePath} (${lineCount} lines)` }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error writing file: ${msg}`, isError: true }
    }
  },
}
