/**
 * PowerShellTool — 执行 PowerShell 命令
 *
 * 参照 smart-code PowerShellTool，简化版。
 * 仅 Windows 平台可用，提供安全验证、超时控制和输出截断。
 */

import type { Tool, ToolResult, ToolContext, ToolInputJSONSchema } from './types'
import { POWERSHELL_TOOL_NAME } from '../constants/prompts'

const MAX_OUTPUT_LENGTH = 50000
const DEFAULT_TIMEOUT_MS = 60000
const MAX_TIMEOUT_MS = 300000

/**
 * PowerShell 危险命令黑名单 — 阻止可能造成破坏的操作。
 * 大小写不敏感，检查命令行中是否包含这些模式。
 */
const DANGEROUS_COMMANDS = [
  'remove-item', 'rm -r', 'rm -f', 'rm -rf', 'del /f', 'rd /s',
  'format-volume', 'format /q', 'diskpart',
  'clear-content', 'truncate',
  'stop-process', 'taskkill /f',
  'set-executionpolicy',
  'reg delete', 'reg delete',
  'wmic', 'cim',
  'net user', 'net localgroup',
]

/**
 * PowerShell 只读命令 — 用于安全友好的命令分类。
 */
const READ_ONLY_COMMANDS = [
  'get-', 'select-', 'where-', 'find-', 'test-', 'format-',
  'write-', 'out-',
  'ls', 'dir', 'cat', 'type', 'more', 'echo',
  'pwd', 'cd', 'sl',
]

function isReadOnlyCommand(command: string): boolean {
  const lower = command.trim().toLowerCase()
  return READ_ONLY_COMMANDS.some((prefix) => lower.startsWith(prefix))
}

function hasDangerousCommand(command: string): boolean {
  const lower = command.trim().toLowerCase()
  return DANGEROUS_COMMANDS.some((dangerous) => lower.includes(dangerous))
}

function sanitizeForSingleLine(command: string): string {
  // Remove newlines in non-quoted strings to prevent multi-command injection
  // Keep newlines inside quoted strings
  let inSingle = false
  let inDouble = false
  let result = ''
  for (const ch of command) {
    if (ch === "'" && !inDouble) inSingle = !inSingle
    if (ch === '"' && !inSingle) inDouble = !inDouble
    if ((ch === '\n' || ch === '\r') && !inSingle && !inDouble) {
      result += ' '
      continue
    }
    result += ch
  }
  return result
}

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      description: 'The PowerShell command to execute',
    },
    timeout: {
      type: 'number',
      description: `Optional timeout in milliseconds (default ${DEFAULT_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS})`,
    },
    description: {
      type: 'string',
      description: 'Clear, concise description of what this command does',
    },
  },
  required: ['command'],
}

export const powerShellTool: Tool = {
  name: POWERSHELL_TOOL_NAME,
  description: `Executes a PowerShell command on Windows and returns its output.

**Platform**: This tool only works on Windows. On macOS/Linux, use ${POWERSHELL_TOOL_NAME} will return an error.

**Shell**: Commands are executed with \`pwsh -NoProfile -Command <command>\` (or \`powershell\` fallback).

**Security**: Dangerous commands (Remove-Item, Format-Volume, Stop-Process -Force, etc.) are blocked. Use the file tools (Read/Write/Edit/Glob/Grep) for file operations instead of PowerShell equivalents.

**Timeout**: Default ${DEFAULT_TIMEOUT_MS / 1000}s, max ${MAX_TIMEOUT_MS / 1000}s.

**Working directory**: Persists between commands. The workDir is set to the project root.

**Output**: Limited to ${(MAX_OUTPUT_LENGTH / 1000).toFixed(0)}KB. Longer output is truncated.

**PipeScript projects**: When working in a PipeScript project directory, you can use \`pwsh -Command "& path/to/pipeScriptProject.ps1"\` to execute PipeScript files. PipeScript is a PowerShell-based scripting language. Make sure to specify the full path to the \`.ps1\` file in the PipeScript project.

**PowerShell commands tips**:
  - Use \`&&\` and \`||\` operators (they work in PowerShell)
  - File paths can use forward slashes ( / ), they work in PowerShell
  - Environment variables: \`$env:VARNAME\`
  - Use \`gci\` or \`Get-ChildItem\` instead of \`ls\` or \`dir\`
  - Use \`gc\` or \`Get-Content\` instead of \`cat\` or \`type\`
  - Use \`sls\` or \`Select-String\` instead of \`findstr\` or \`grep\`
  - Use \`? { ... }\` or \`Where-Object { ... }\` instead of \`find\`
  - Use \`ForEach-Object { ... }\` or \`%\` instead of \`for\` loops
  - Pipeline output is automatically formatted by PowerShell`,
  inputSchema,
  async execute(input, context: ToolContext): Promise<ToolResult> {
    if (process.platform !== 'win32') {
      return {
        content: `Error: ${POWERSHELL_TOOL_NAME} is only available on Windows. This system is running ${process.platform}. Use ${POWERSHELL_TOOL_NAME} instead for shell commands.`,
        isError: true,
      }
    }

    let command = input.command as string
    if (!command || typeof command !== 'string') {
      return { content: 'Error: command is required', isError: true }
    }

    // Block dangerous commands
    if (hasDangerousCommand(command)) {
      return {
        content: `Error: Command blocked for security reasons. The command appears to be destructive:\n\`\`\`\n${command}\n\`\`\`\n\nUse file tools (Read/Write/Edit/Glob/Grep) for file operations instead.`,
        isError: true,
      }
    }

    // Sanitize multi-line commands
    command = sanitizeForSingleLine(command)

    const timeoutMs = Math.min(Number(input.timeout) || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS)

    try {
      // Try pwsh first, fall back to powershell
      const pwshPath = findPowerShell()
      if (!pwshPath) {
        return {
          content: 'Error: PowerShell (pwsh or powershell) not found in PATH. Please install PowerShell 7+ from https://github.com/PowerShell/PowerShell',
          isError: true,
        }
      }

      const cmd = [pwshPath, '-NoProfile', '-Command', command]

      const proc = Bun.spawn({
        cmd,
        cwd: context.workDir || undefined,
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore',
      })

      const timer = setTimeout(() => {
        try { proc.kill() } catch { /* already exited */ }
      }, timeoutMs)

      const stdoutPromise = new Response(proc.stdout).text()
      const stderrPromise = new Response(proc.stderr).text()
      const exitCode = await proc.exited
      clearTimeout(timer)

      const stdout = await stdoutPromise
      const stderr = await stderrPromise

      let output = ''
      if (stdout) output += stdout
      if (stderr) {
        // Filter out PowerShell noise warnings
        const filtered = stderr.split('\n')
          .filter((l) => !l.includes('Making script file executable'))
          .join('\n')
          .trim()
        if (filtered) output += (output ? '\n' : '') + filtered
      }

      // Truncate if too long
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = output.slice(0, MAX_OUTPUT_LENGTH) + '\n\n... [output truncated]'
      }

      const trimmed = output.trim()
      if (exitCode === 0) {
        return { content: trimmed || '(command completed with no output)' }
      } else {
        return {
          content: trimmed || `(command failed with exit code ${exitCode})`,
          isError: true,
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error executing PowerShell command: ${msg}`, isError: true }
    }
  },
}

/**
 * Find PowerShell executable — try pwsh (PowerShell 7+) first, fall back to powershell (Windows PowerShell).
 */
function findPowerShell(): string | null {
  // Try pwsh (cross-platform, modern)
  const pwsh = Bun.which('pwsh')
  if (pwsh) return pwsh

  // Fall back to powershell.exe (Windows-only)
  const powershell = Bun.which('powershell')
  if (powershell) return powershell

  return null
}
