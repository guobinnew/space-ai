/**
 * BashTool — 执行 shell 命令
 *
 * 参照 smart-code BashTool，简化版。
 * 在工作目录下执行命令，返回 stdout+stderr。
 * Windows 用 PowerShell，Unix 用 bash -c。
 */

import type { Tool, ToolResult, ToolContext, ToolInputJSONSchema } from './types'
import { BASH_TOOL_NAME } from '../constants/prompts'

const MAX_OUTPUT_LENGTH = 50000

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      description: 'The command to execute',
    },
    timeout: {
      type: 'number',
      description: 'Optional timeout in milliseconds (max 120000)',
    },
    description: {
      type: 'string',
      description: 'Clear, concise description of what this command does (e.g. "List files in current directory")',
    },
  },
  required: ['command'],
}

export const bashTool: Tool = {
  name: BASH_TOOL_NAME,
  description: `Executes a given command and returns its output.

The working directory persists between commands, but shell state does not.

IMPORTANT: Avoid using this tool to run \`find\`, \`grep\`, \`cat\`, \`head\`, \`tail\`, \`sed\`, \`awk\`, or \`echo\` commands, unless explicitly instructed. Instead, use the appropriate dedicated tool:
  - File search: Use Glob (NOT find or ls)
  - Content search: Use Grep (NOT grep or rg)
  - Read files: Use Read (NOT cat/head/tail)
  - Edit files: Use Edit (NOT sed/awk)
  - Write files: Use Write (NOT echo >/cat <<EOF)

# Shell environment
The command runs under the following shell based on the current platform:
  - **Windows**: PowerShell
  - **macOS/Linux**: bash

On Windows, the command is executed via \`powershell -NoProfile -Command\`.
This means:
  - Unix-only commands like \`tail\`, \`head\`, \`grep\`, \`find\`, \`sed\`, \`awk\` will NOT work.
  - Use PowerShell-compatible alternatives or appropriate Tools instead.
  - File paths can use either backslashes (\\) or forward slashes (/).
  - Environment variables use \`$env:VARNAME\` syntax (PowerShell).
  - Use \`&&\` and \`||\` operators (they work in PowerShell too).

# Instructions
 - Try to maintain your current working directory by using absolute paths and avoiding \`cd\`.
 - You may specify an optional timeout in milliseconds (up to 120000ms / 2 minutes). Default timeout is 30000ms.
 - When issuing multiple commands: if independent, make multiple Bash calls in parallel; if dependent, chain with '&&'.
 - DO NOT use newlines to separate commands (newlines are ok in quoted strings).
 - Always quote file paths that contain spaces with double quotes.`,
  inputSchema,
  async execute(input, context: ToolContext): Promise<ToolResult> {
    const command = input.command as string
    const timeoutMs = Math.min(Number(input.timeout) || 30000, 120000)

    if (!command || typeof command !== 'string') {
      return { content: 'Error: command is required', isError: true }
    }

    try {
      const isWindows = process.platform === 'win32'
      // Windows: use PowerShell instead of cmd.exe for better Unix-command compatibility
      // (e.g. &&, ||, 2>&1, quoting behave more like bash)
      const cmd = isWindows
        ? ['powershell', '-NoProfile', '-Command', command]
        : ['bash', '-c', command]

      const proc = Bun.spawn({
        cmd,
        cwd: context.workDir || undefined,
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore',
      })

      // Timeout handling
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
      if (stderr) output += (output ? '\n' : '') + stderr

      // Truncate if too long
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = output.slice(0, MAX_OUTPUT_LENGTH) + '\n... [output truncated]'
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
      return { content: `Error executing command: ${msg}`, isError: true }
    }
  },
}
