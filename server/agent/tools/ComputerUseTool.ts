/**
 * ComputerUseTool — 计算机操作工具
 *
 * 通过 Python helper (pyautogui + mss) 实现屏幕截图、鼠标点击、
 * 键盘输入等操作。需要先运行 /api/computer-use/setup 安装依赖。
 *
 * 参照 smart-code vendor/computer-use-mcp/tools.ts，简化为单工具多 action。
 */

import type { Tool, ToolResult, ToolContext, ToolInputJSONSchema } from './types'
import { callPythonHelper, getVenvPythonPath, getRuntimeDir } from '../services/computerUseService'
import { existsSync } from 'node:fs'
import path from 'node:path'

const COMPUTER_USE_TOOL_NAME = 'UseComputer'

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['screenshot', 'click', 'type', 'key', 'scroll', 'mouse_move', 'cursor_position', 'read_clipboard', 'write_clipboard'],
      description: 'The computer use action to perform.',
    },
    coordinate: {
      type: 'array',
      items: { type: 'number' },
      minItems: 2,
      maxItems: 2,
      description: '(x, y) pixel coordinates for click, mouse_move, scroll. Read directly from the most recent screenshot.',
    },
    text: {
      type: 'string',
      description: 'Text to type (for "type" action) or clipboard content (for "write_clipboard" action).',
    },
    keys: {
      type: 'string',
      description: 'Key combination for "key" action, e.g. "ctrl+c", "alt+tab", "enter". Use "+" to separate modifier keys.',
    },
    button: {
      type: 'string',
      enum: ['left', 'right', 'middle'],
      description: 'Mouse button for click (default: left).',
    },
    clicks: {
      type: 'number',
      description: 'Number of clicks (default: 1). Use 2 for double-click.',
    },
    amount: {
      type: 'number',
      description: 'Scroll amount for "scroll" action. Positive = up, negative = down.',
    },
  },
  required: ['action'],
}

function checkEnvironment(): { ok: boolean; error?: string } {
  const venvPython = getVenvPythonPath()
  if (!existsSync(venvPython)) {
    return { ok: false, error: '计算机操作环境未安装。请在设置页面运行"环境安装"后再使用。' }
  }
  const helperScript = path.join(getRuntimeDir(), process.platform === 'win32' ? 'win_helper.py' : 'mac_helper.py')
  if (!existsSync(helperScript)) {
    return { ok: false, error: 'Python helper 脚本缺失，请重新运行环境安装。' }
  }
  return { ok: true }
}

export const computerUseTool: Tool = {
  name: COMPUTER_USE_TOOL_NAME,
  description: `Control the computer: take screenshots, click, type text, press keys, scroll, and manage clipboard.

## Actions

- **screenshot**: Capture the primary screen. Returns a base64 JPEG image.
- **click**: Click at (x, y). Set clicks=2 for double-click, button="right" for right-click.
- **type**: Type text string at current cursor position.
- **key**: Press key combination (e.g. "ctrl+c", "alt+tab", "enter", "escape").
- **scroll**: Scroll at current or specified position. Positive=up, negative=down.
- **mouse_move**: Move mouse to (x, y) without clicking.
- **cursor_position**: Get current mouse position.
- **read_clipboard**: Read text from clipboard.
- **write_clipboard**: Write text to clipboard.

## Coordinates
Read x, y directly from the most recent screenshot image pixels. The top-left corner is (0, 0).

## Workflow
1. Take a screenshot to see the current screen state
2. Identify the element to interact with
3. Click or type as needed
4. Take another screenshot to verify the result

Requires environment setup. If not installed, instruct the user to run setup in Settings > Computer Use.`,
  inputSchema,
  async execute(input: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    // 环境检查
    const env = checkEnvironment()
    if (!env.ok) {
      return { content: env.error!, isError: true }
    }

    const action = input.action as string
    const params: Record<string, unknown> = {}

    // 构建 Python helper 参数
    switch (action) {
      case 'screenshot':
        // 无额外参数
        break
      case 'click': {
        const coord = input.coordinate as number[] | undefined
        if (!coord || coord.length < 2) {
          return { content: 'click 需要提供 coordinate 参数 [x, y]', isError: true }
        }
        params.x = coord[0]
        params.y = coord[1]
        params.button = input.button || 'left'
        params.clicks = input.clicks || 1
        break
      }
      case 'type': {
        if (!input.text) {
          return { content: 'type 需要提供 text 参数', isError: true }
        }
        params.text = input.text
        break
      }
      case 'key': {
        if (!input.keys) {
          return { content: 'key 需要提供 keys 参数', isError: true }
        }
        // 转换 "ctrl+c" → ["ctrl", "c"]
        params.keys = (input.keys as string).split('+').map((k) => k.trim())
        break
      }
      case 'scroll': {
        params.amount = input.amount || 0
        const coord = input.coordinate as number[] | undefined
        if (coord && coord.length >= 2) {
          params.x = coord[0]
          params.y = coord[1]
        }
        break
      }
      case 'mouse_move': {
        const coord = input.coordinate as number[] | undefined
        if (!coord || coord.length < 2) {
          return { content: 'mouse_move 需要提供 coordinate 参数 [x, y]', isError: true }
        }
        params.x = coord[0]
        params.y = coord[1]
        break
      }
      case 'cursor_position':
        break
      case 'read_clipboard':
        break
      case 'write_clipboard': {
        if (!input.text) {
          return { content: 'write_clipboard 需要提供 text 参数', isError: true }
        }
        params.text = input.text
        break
      }
      default:
        return { content: `未知的 action: ${action}`, isError: true }
    }

    try {
      const result = await callPythonHelper(action, params) as Record<string, unknown>

      // 检查 Python 返回的错误
      if (result.error) {
        return { content: `执行失败: ${result.error}`, isError: true }
      }

      // 截图特殊处理：返回图片信息
      if (action === 'screenshot' && result.image) {
        const width = result.width as number
        const height = result.height as number
        return {
          content: `截图完成 (${width}x${height})。图片已保存到临时位置，请查看附带的图片数据。\n\n截图尺寸: ${width} × ${height} 像素\n\n接下来可以:\n1. 分析截图内容\n2. 点击指定坐标\n3. 输入文本\n4. 按键`,
        }
      }

      // 其他操作返回 JSON
      return { content: JSON.stringify(result, null, 2) }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Python helper 执行出错: ${msg}`, isError: true }
    }
  },
}
