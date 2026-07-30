/**
 * GrepTool — 文件内容搜索
 *
 * 参照 smart-code GrepTool，简化版。
 * 由于运行时可能没有 ripgrep，使用 JS 实现文件遍历 + 正则匹配。
 * 支持 output_mode: content / files_with_matches / count。
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { Tool, ToolResult, ToolContext, ToolInputJSONSchema } from './types'
import { GREP_TOOL_NAME } from '../constants/prompts'

const MAX_RESULTS = 250
const MAX_FILE_SIZE = 1024 * 1024 // 1MB per file

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    pattern: {
      type: 'string',
      description: 'The regular expression pattern to search for in file contents',
    },
    path: {
      type: 'string',
      description: 'File or directory to search in. Defaults to current working directory.',
    },
    glob: {
      type: 'string',
      description: 'Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}")',
    },
    output_mode: {
      type: 'string',
      enum: ['content', 'files_with_matches', 'count'],
      description: 'Output mode: "content" shows matching lines, "files_with_matches" shows file paths (default), "count" shows match counts.',
    },
    '-i': {
      type: 'boolean',
      description: 'Case insensitive search',
    },
    '-n': {
      type: 'boolean',
      description: 'Show line numbers in content mode (default true)',
    },
    context: {
      type: 'number',
      description: 'Number of lines to show before and after each match (content mode only)',
    },
    head_limit: {
      type: 'number',
      description: 'Limit output to first N lines/entries. Defaults to 250.',
    },
    type: {
      type: 'string',
      description: 'File type to search (e.g. "js", "ts", "py"). More efficient than glob for standard types.',
    },
  },
  required: ['pattern'],
}

// 常见文件类型 → 扩展名映射
const TYPE_EXTENSIONS: Record<string, string[]> = {
  js: ['.js', '.jsx', '.mjs', '.cjs'],
  ts: ['.ts', '.tsx'],
  py: ['.py'],
  rust: ['.rs'],
  go: ['.go'],
  java: ['.java'],
  c: ['.c', '.h'],
  cpp: ['.cpp', '.cc', '.cxx', '.h', '.hpp'],
  rb: ['.rb'],
  php: ['.php'],
  sh: ['.sh', '.bash'],
  json: ['.json'],
  yaml: ['.yaml', '.yml'],
  md: ['.md', '.markdown'],
  html: ['.html', '.htm'],
  css: ['.css'],
  vue: ['.vue'],
}

// 忽略的目录
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.cache', 'vendor', 'target', '.venv', 'venv', 'out',
])

export const grepTool: Tool = {
  name: GREP_TOOL_NAME,
  description: `A powerful search tool for searching file contents.

  Usage:
  - ALWAYS use Grep for search tasks. NEVER invoke \`grep\` or \`rg\` as a Bash command.
  - Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
  - Filter files with glob parameter (e.g., "*.js") or type parameter (e.g., "js", "py")
  - Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
  - Pattern syntax: Uses standard regex - literal braces need escaping`,
  inputSchema,
  async execute(input, context: ToolContext): Promise<ToolResult> {
    const pattern = input.pattern as string
    const searchPath = (input.path as string) || context.workDir || process.cwd()
    const caseInsensitive = input['-i'] === true
    const showLineNumbers = input['-n'] !== false
    const contextLines = Number(input.context) || 0
    const outputMode = (input.output_mode as string) || 'files_with_matches'
    const headLimit = Number(input.head_limit) || MAX_RESULTS
    const globFilter = input.glob as string | undefined
    const typeFilter = input.type as string | undefined

    if (!pattern) {
      return { content: 'Error: pattern is required', isError: true }
    }

    try {
      let regex: RegExp
      try {
        regex = new RegExp(pattern, caseInsensitive ? 'gi' : 'g')
      } catch {
        return { content: `Error: invalid regex pattern: ${pattern}`, isError: true }
      }

      // 确定允许的扩展名
      let allowedExts: Set<string> | null = null
      if (typeFilter && TYPE_EXTENSIONS[typeFilter]) {
        allowedExts = new Set(TYPE_EXTENSIONS[typeFilter])
      }

      // glob 过滤（简化：支持 *.ext 和 *.{ext1,ext2}）
      let globExts: Set<string> | null = null
      if (globFilter) {
        const exts = parseGlobExtensions(globFilter)
        if (exts) globExts = new Set(exts)
      }

      // 收集要搜索的文件
      const files: string[] = await collectFiles(searchPath, allowedExts, globExts)

      const results: Array<{
        file: string
        matches: Array<{ line: number; text: string; context?: string[] }>
      }> = []

      let totalMatches = 0
      let resultCount = 0

      for (const file of files) {
        if (resultCount >= headLimit && outputMode !== 'content') break

        try {
          const stat = await fs.stat(file)
          if (stat.size > MAX_FILE_SIZE) continue

          const content = await fs.readFile(file, 'utf-8')
          const lines = content.split('\n')
          const fileMatches: Array<{ line: number; text: string; context?: string[] }> = []

          for (let i = 0; i < lines.length; i++) {
            regex.lastIndex = 0
            if (regex.test(lines[i])) {
              const contextArr = contextLines > 0
                ? lines.slice(Math.max(0, i - contextLines), Math.min(lines.length, i + contextLines + 1))
                : undefined
              fileMatches.push({ line: i + 1, text: lines[i], context: contextArr })
              totalMatches++
            }
          }

          if (fileMatches.length > 0) {
            results.push({ file, matches: fileMatches })
            resultCount++
          }
        } catch {
          // Skip unreadable files
        }
      }

      // Format output
      if (results.length === 0) {
        return { content: 'No matches found.' }
      }

      let output = ''
      if (outputMode === 'files_with_matches') {
        output = results.map((r) => r.file).join('\n')
      } else if (outputMode === 'count') {
        output = results.map((r) => `${r.file}:${r.matches.length}`).join('\n')
      } else {
        // content mode
        const parts: string[] = []
        for (const r of results) {
          for (const m of r.matches) {
            const linePrefix = showLineNumbers ? `${r.file}:${m.line}:` : `${r.file}:`
            if (m.context) {
              parts.push(m.context.map((ctx, idx) => {
                const ctxLine = m.line - contextLines + idx
                const prefix = ctxLine === m.line ? linePrefix : `${r.file}-${ctxLine}:`
                return `${prefix}${ctx}`
              }).join('\n'))
            } else {
              parts.push(`${linePrefix}${m.text}`)
            }
          }
        }
        output = parts.slice(0, headLimit).join('\n')
        if (parts.length > headLimit) {
          output += `\n... (${parts.length - headLimit} more matches not shown)`
        }
      }

      return { content: output }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error during grep search: ${msg}`, isError: true }
    }
  },
}

function parseGlobExtensions(glob: string): string[] | null {
  // *.ext → ['.ext']
  const simple = glob.match(/^\*\.(\w+)$/)
  if (simple) return ['.' + simple[1]]

  // *.{ext1,ext2} → ['.ext1', '.ext2']
  const multi = glob.match(/^\*\.\{([\w,]+)\}$/)
  if (multi) return multi[1].split(',').map((e) => '.' + e.trim())

  return null
}

async function collectFiles(
  searchPath: string,
  allowedExts: Set<string> | null,
  globExts: Set<string> | null,
): Promise<string[]> {
  const files: string[] = []

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 15) return // Prevent infinite recursion
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          await walk(fullPath, depth + 1)
        }
      } else if (entry.isFile()) {
        // 扩展名过滤
        const ext = path.extname(entry.name)
        if (allowedExts && !allowedExts.has(ext)) continue
        if (globExts && !globExts.has(ext)) continue
        files.push(fullPath)
      }
    }
  }

  // Check if searchPath is a file or directory
  try {
    const stat = await fs.stat(searchPath)
    if (stat.isFile()) {
      files.push(searchPath)
    } else {
      await walk(searchPath, 0)
    }
  } catch {
    // Path doesn't exist
  }

  return files
}
