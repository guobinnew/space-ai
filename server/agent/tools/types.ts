/**
 * Tool 类型定义
 *
 * 参照 smart-code Tool.ts，简化版。
 * 每个工具实现 Tool 接口，由 toolRegistry 注册，
 * 在 LLM agentic loop 中被调用。
 */

/** JSON Schema 格式的工具输入参数定义 */
export type ToolInputJSONSchema = {
  type: 'object'
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

/** 工具执行上下文 */
export interface ToolContext {
  /** 工作目录（Bash 命令的 cwd，Glob/Grep 的默认搜索路径） */
  workDir: string
  /** 会话 ID */
  sessionId: string
}

/** 工具执行结果 */
export interface ToolResult {
  /** 返回给 LLM 的文本内容 */
  content: string
  /** 是否为错误结果 */
  isError?: boolean
}

/** 工具接口 */
export interface Tool {
  /** 工具名称（LLM 调用时使用） */
  name: string
  /** 工具描述（发送给 LLM） */
  description: string
  /** 输入参数 JSON Schema */
  inputSchema: ToolInputJSONSchema
  /** 执行工具 */
  execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>
}

/** Anthropic API 工具定义格式（发送给 LLM） */
export interface ToolDefinition {
  name: string
  description: string
  input_schema: ToolInputJSONSchema
}
