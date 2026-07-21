/**
 * 上下文压缩服务：token 估算 + 触发阈值判断。
 * 参考 smart-code src/services/compact/autoCompact.ts 与 tokenEstimation.ts。
 *
 * token 估算采用粗略的 chars/4（与 smart-code roughTokenCountEstimation 一致），
 * 不依赖 tokenizer，足够用于触发判断。
 */

type AnyMessage = { role: string; content: unknown }

/** 默认上下文窗口（token）。Anthropic Claude 系列通常 200K。 */
export const DEFAULT_CONTEXT_WINDOW_ANTHROPIC = 200000
/** OpenAI 兼容模型默认窗口。 */
export const DEFAULT_CONTEXT_WINDOW_OPENAI = 128000

/** 预留给压缩摘要输出的 token（参考 smart-code MAX_OUTPUT_TOKENS_FOR_SUMMARY） */
const RESERVED_SUMMARY_TOKENS = 20000
/** 压缩触发缓冲（参考 smart-code AUTOCOMPACT_BUFFER_TOKENS） */
const AUTOCOMPACT_BUFFER_TOKENS = 13000

function estimateTokensForContent(content: unknown): number {
  if (!content) return 0
  if (typeof content === 'string') return Math.ceil(content.length / 4)
  if (Array.isArray(content)) {
    let total = 0
    for (const block of content as unknown[]) {
      total += estimateTokensForBlock(block)
    }
    return total
  }
  return 0
}

function estimateTokensForBlock(block: unknown): number {
  if (typeof block === 'string') return Math.ceil(block.length / 4)
  if (!block || typeof block !== 'object') return 0
  const b = block as Record<string, unknown>
  switch (b.type) {
    case 'text':
      return Math.ceil(String(b.text ?? '').length / 4)
    case 'thinking':
      // thinking 不计入发送上下文（压缩时会剥离），但估算时仍计入以反映真实占用
      return Math.ceil(String(b.thinking ?? '').length / 4)
    case 'tool_use':
      return Math.ceil(JSON.stringify(b.input ?? {}).length / 4) + 20
    case 'tool_result':
      return estimateTokensForContent(b.content) + 20
    default:
      return Math.ceil(JSON.stringify(b).length / 4)
  }
}

/**
 * 粗略估算消息列表的 token 总数。
 */
export function estimateTokensForMessages(messages: readonly AnyMessage[]): number {
  let total = 0
  for (const m of messages) {
    total += estimateTokensForContent(m.content) + 4 // per-message overhead
  }
  return total
}

/**
 * 压缩触发阈值 = 有效窗口 - 缓冲。
 * 有效窗口 = 上下文窗口 - 预留摘要 token。
 */
export function getAutoCompactThreshold(contextWindow: number): number {
  const effectiveWindow = contextWindow - RESERVED_SUMMARY_TOKENS
  return effectiveWindow - AUTOCOMPACT_BUFFER_TOKENS
}

/**
 * 判断是否应当触发自动压缩。
 * @param messages 消息列表
 * @param contextWindow 模型上下文窗口大小（token）
 */
export function shouldAutoCompact(
  messages: readonly AnyMessage[],
  contextWindow: number,
): boolean {
  // 消息太少时不压缩（没有足够内容可摘要）
  if (messages.length < 4) return false
  const tokenCount = estimateTokensForMessages(messages)
  const threshold = getAutoCompactThreshold(contextWindow)
  return tokenCount >= threshold
}
