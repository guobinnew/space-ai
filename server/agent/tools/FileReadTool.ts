/**
 * FileReadTool — 读取文件
 *
 * 参照 smart-code FileReadTool，简化版。
 * 读取文件内容，支持 offset/limit 分页，返回带行号格式（cat -n）。
 */

import * as fs from 'fs/promises'
import type { Tool, ToolResult, ToolContext, ToolInputJSONSchema } from './types'
import { FILE_READ_TOOL_NAME } from '../constants/prompts'

const MAX_LINES_TO_READ = 2000

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    file_path: {
      type: 'string',
      description: 'The absolute path to the file to read',
    },
    offset: {
      type: 'number',
      description: 'The line number to start reading from. Only provide if the file is too large to read at once.',
      minimum: 0,
    },
    limit: {
      type: 'number',
      description: 'The number of lines to read. Only provide if the file is too large to read at once.',
      minimum: 1,
    },
  },
  required: ['file_path'],
}

export const fileReadTool: Tool = {
  name: FILE_READ_TOOL_NAME,
  description: `Reads a file from the local filesystem. You can access any file directly by using this tool.

Usage:
- The file_path parameter must be an absolute path, not a relative path
- By default, it reads up to ${MAX_LINES_TO_READ} lines starting from the beginning of the file
- Results are returned using cat -n format, with line numbers starting at 1
- This tool can read images (PNG, JPG, etc). When reading an image the contents are presented visually.
- This tool can only read files, not directories. To read a directory, use ls via the Bash tool.
- If you read a file that exists but has empty contents you will receive a system reminder warning.`,
  inputSchema,
  async execute(input): Promise<ToolResult> {
    const filePath = input.file_path as string
    if (!filePath) {
      return { content: 'Error: file_path is required', isError: true }
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const lines = content.split('\n')

      // Handle files that don't end with newline
      const hasTrailingNewline = content.endsWith('\n')
      const effectiveLines = hasTrailingNewline ? lines.slice(0, -1) : lines

      const offset = Math.max(0, Number(input.offset) || 0)
      const limit = Math.min(Number(input.limit) || MAX_LINES_TO_READ, MAX_LINES_TO_READ)

      const startIdx = offset
      const endIdx = Math.min(startIdx + limit, effectiveLines.length)
      const slice = effectiveLines.slice(startIdx, endIdx)

      // cat -n format: line numbers right-aligned to 6 chars + tab
      const numbered = slice
        .map((line, i) => `${String(startIdx + i + 1).padStart(6, ' ')}\t${line}`)
        .join('\n')

      if (!numbered) {
        return { content: '<file is empty>' }
      }

      const truncatedNote = endIdx < effectiveLines.length
        ? `\n... (${effectiveLines.length - endIdx} more lines, use offset to read further)`
        : ''

      return { content: numbered + truncatedNote }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        return { content: `File not found: ${filePath}`, isError: true }
      }
      if (code === 'EISDIR') {
        return { content: `Path is a directory, not a file: ${filePath}`, isError: true }
      }
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error reading file: ${msg}`, isError: true }
    }
  },
}
