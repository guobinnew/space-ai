/**
 * GlobTool — 文件名模式匹配
 *
 * 参照 smart-code GlobTool，简化版。
 * 使用 Bun.Glob 进行快速文件模式匹配，返回按修改时间排序的路径。
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { Tool, ToolResult, ToolContext, ToolInputJSONSchema } from './types'
import { GLOB_TOOL_NAME } from '../constants/prompts'

const MAX_RESULTS = 100

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    pattern: {
      type: 'string',
      description: 'The glob pattern to match files against (e.g. "**/*.ts", "src/**/*.tsx")',
    },
    path: {
      type: 'string',
      description: 'The directory to search in. If not specified, the current working directory will be used.',
    },
  },
  required: ['pattern'],
}

export const globTool: Tool = {
  name: GLOB_TOOL_NAME,
  description: `- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, consider doing so`,
  inputSchema,
  async execute(input, context: ToolContext): Promise<ToolResult> {
    const pattern = input.pattern as string
    const searchDir = (input.path as string) || context.workDir || process.cwd()

    if (!pattern) {
      return { content: 'Error: pattern is required', isError: true }
    }

    try {
      const Glob = Bun.Glob
      const glob = new Glob(pattern)

      const results: Array<{ path: string; mtime: number }> = []
      for await (const match of glob.scan({ cwd: searchDir, onlyFiles: true })) {
        const fullPath = path.resolve(searchDir, match)
        try {
          const stat = await fs.stat(fullPath)
          results.push({ path: fullPath, mtime: stat.mtimeMs })
        } catch {
          results.push({ path: fullPath, mtime: 0 })
        }
        if (results.length >= MAX_RESULTS * 2) break // Collect extra for sorting, then truncate
      }

      // Sort by modification time (newest first)
      results.sort((a, b) => b.mtime - a.mtime)

      const truncated = results.slice(0, MAX_RESULTS)
      if (truncated.length === 0) {
        return { content: 'No files found matching the pattern.' }
      }

      const lines = truncated.map((r) => r.path)
      let output = lines.join('\n')
      if (results.length > MAX_RESULTS) {
        output += `\n... (${results.length - MAX_RESULTS} more results not shown)`
      }
      return { content: output }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error during glob search: ${msg}`, isError: true }
    }
  },
}
