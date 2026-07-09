/**
 * Tool Registry — 工具注册表
 *
 * 管理所有内建工具，提供按名称查找和获取工具定义列表的能力。
 */

import type { Tool, ToolDefinition } from './types'
import { bashTool } from './BashTool'
import { fileReadTool } from './FileReadTool'
import { fileWriteTool } from './FileWriteTool'
import { fileEditTool } from './FileEditTool'
import { globTool } from './GlobTool'
import { grepTool } from './GrepTool'

/** 所有内建工具 */
const builtinTools: Tool[] = [
  bashTool,
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  globTool,
  grepTool,
]

/** 工具名 → 工具实例 映射 */
const toolMap = new Map<string, Tool>(builtinTools.map((t) => [t.name, t]))

/** 按名称获取工具 */
export function getTool(name: string): Tool | undefined {
  return toolMap.get(name)
}

/** 获取所有工具定义（发送给 LLM 的格式） */
export function getToolDefinitions(): ToolDefinition[] {
  return builtinTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }))
}

/** 获取所有工具名称 */
export function getToolNames(): string[] {
  return builtinTools.map((t) => t.name)
}
