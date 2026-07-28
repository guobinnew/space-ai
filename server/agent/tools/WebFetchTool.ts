/**
 * WebFetchTool — 获取网页内容
 *
 * 参照 smart-code WebFetchTool，简化版。
 * 获取 URL 内容，将 HTML 转为纯文本，截断后返回。
 * 不使用 AI 模型处理（smart-code 用小模型，我们直接返回文本）。
 */

import type { Tool, ToolResult, ToolInputJSONSchema } from './types'

export const WEB_FETCH_TOOL_NAME = 'WebFetch'

const MAX_CONTENT_LENGTH = 30000

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    url: {
      type: 'string',
      description: 'The URL to fetch content from',
    },
    prompt: {
      type: 'string',
      description: 'The prompt describing what information you want to extract from the page',
    },
  },
  required: ['url', 'prompt'],
}

export const webFetchTool: Tool = {
  name: WEB_FETCH_TOOL_NAME,
  description: `Fetches content from a specified URL and returns it as text.

- Takes a URL and a prompt as input
- Fetches the URL content, converts HTML to plain text
- Returns the text content (may be truncated for large pages)
- Use this tool when you need to retrieve and analyze web content

Usage notes:
  - The URL must be a fully-formed valid URL
  - HTTP URLs will be automatically upgraded to HTTPS
  - This tool is read-only and does not modify any files
  - Results may be truncated if the content is very large
  - For GitHub URLs, prefer using the gh CLI via Bash instead`,
  inputSchema,
  async execute(input): Promise<ToolResult> {
    const url = input.url as string
    const prompt = input.prompt as string

    if (!url || typeof url !== 'string') {
      return { content: 'Error: url is required', isError: true }
    }
    if (!prompt || typeof prompt !== 'string') {
      return { content: 'Error: prompt is required', isError: true }
    }

    // Upgrade HTTP to HTTPS
    let fetchUrl = url
    if (fetchUrl.startsWith('http://')) {
      fetchUrl = 'https://' + fetchUrl.slice(7)
    }

    try {
      const response = await fetch(fetchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SmartLab/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
        },
        signal: AbortSignal.timeout(30000),
        redirect: 'follow',
      })

      if (!response.ok) {
        return { content: `HTTP ${response.status}: ${response.statusText}`, isError: true }
      }

      const contentType = response.headers.get('content-type') || ''
      const rawText = await response.text()

      let text: string
      if (contentType.includes('application/json')) {
        // Return JSON as-is (pretty printed)
        try {
          text = JSON.stringify(JSON.parse(rawText), null, 2)
        } catch {
          text = rawText
        }
      } else if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
        // Convert HTML to plain text
        text = htmlToText(rawText)
      } else {
        // Return as plain text
        text = rawText
      }

      // Truncate if too long
      if (text.length > MAX_CONTENT_LENGTH) {
        text = text.slice(0, MAX_CONTENT_LENGTH) + '\n\n... [content truncated]'
      }

      return {
        content: `URL: ${fetchUrl}\nPrompt: ${prompt}\n\n--- Content ---\n${text}`,
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        return { content: 'Error: request timed out (30s)', isError: true }
      }
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error fetching URL: ${msg}`, isError: true }
    }
  },
}

/**
 * 简单的 HTML 转纯文本：
 * - 移除 script/style 标签及内容
 * - 移除所有 HTML 标签
 * - 解码基本 HTML 实体
 * - 压缩空白
 */
function htmlToText(html: string): string {
  let text = html

  // Remove script and style elements with content
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '')

  // Convert common block elements to newlines
  text = text.replace(/<(?:p|div|br|li|h[1-6]|tr|table)[^>]*>/gi, '\n')

  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))

  // Compress whitespace
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text
}
