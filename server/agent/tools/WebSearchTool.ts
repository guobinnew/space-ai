/**
 * WebSearchTool — Web 搜索
 *
 * 参照 smart-code WebSearchTool，简化版。
 * 使用智谱 BigModel web search API。
 * API key 从 settings.json 的 webSearch.apiKey 读取。
 */

import { settingService } from '../services/settingService'
import type { Tool, ToolResult, ToolInputJSONSchema } from './types'

export const WEB_SEARCH_TOOL_NAME = 'WebSearch'

const inputSchema: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'The search query to use (keep concise, ≤70 chars recommended)',
    },
    allowed_domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'Only include search results from these domains',
    },
    blocked_domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'Never include search results from these domains',
    },
  },
  required: ['query'],
}

interface ZhipuSearchResult {
  title: string
  link: string
  content: string
  media?: string
}

export const webSearchTool: Tool = {
  name: WEB_SEARCH_TOOL_NAME,
  description: `- Allows searching the web and use the results to inform responses
- Provides up-to-date information for current events and recent data
- Returns search result information formatted as search result blocks, including links as markdown hyperlinks
- Use this tool for accessing information beyond your knowledge cutoff
- Query should be concise (≤70 characters recommended) for best results

CRITICAL REQUIREMENT - You MUST follow this:
  - After answering the user's question, you MUST include a "Sources:" section at the end of your response
  - In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: [Title](URL)
  - This is MANDATORY - never skip including sources in your response

Usage notes:
  - Domain filtering is supported via allowed_domains/blocked_domains
  - Query length is limited to ~70 characters for optimal results`,
  inputSchema,
  async execute(input): Promise<ToolResult> {
    const query = input.query as string
    const allowedDomains = input.allowed_domains as string[] | undefined
    const blockedDomains = input.blocked_domains as string[] | undefined

    if (!query || typeof query !== 'string') {
      return { content: 'Error: query is required', isError: true }
    }

    // Get search API config from settings
    let apiKey = ''
    let provider = 'none'
    try {
      const settings = await settingService.getGeneralSettings()
      apiKey = settings.webSearch.apiKey
      provider = settings.webSearch.provider
    } catch {
      // Settings not available
    }

    if (provider === 'none' || !apiKey) {
      return {
        content: 'Error: Web search is not configured. Please set up a search API provider in Settings > General > Web Search.',
        isError: true,
      }
    }

    if (allowedDomains && blockedDomains) {
      return {
        content: 'Error: Cannot specify both allowed_domains and blocked_domains',
        isError: true,
      }
    }

    try {
      const results = await searchZhipu(query, apiKey, allowedDomains, blockedDomains)

      if (results.length === 0) {
        return { content: 'No search results found.' }
      }

      // Format results
      const formatted = results.map((r, i) => {
        const parts = [`### ${i + 1}. [${r.title}](${r.link})`]
        if (r.media) parts.push(`*Source: ${r.media}*`)
        parts.push(r.content)
        return parts.join('\n')
      })

      const sources = results.map((r) => `- [${r.title}](${r.link})`).join('\n')

      return {
        content: `${formatted.join('\n\n---\n\n')}\n\n## Sources\n${sources}`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error during web search: ${msg}`, isError: true }
    }
  },
}

/** 调用智谱 BigModel web search API */
async function searchZhipu(
  query: string,
  apiKey: string,
  allowedDomains?: string[],
  blockedDomains?: string[],
): Promise<ZhipuSearchResult[]> {
  const body: Record<string, unknown> = {
    search_engine: 'search_std',
    search_query: query,
    search_recency_filter: 'oneMonth',
  }

  if (allowedDomains && allowedDomains.length > 0) {
    body.search_domain_filter = allowedDomains
  }

  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/web_search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Zhipu search API ${response.status}: ${errText.slice(0, 200)}`)
  }

  const data = await response.json() as { search_result?: ZhipuSearchResult[] }

  let results = data.search_result || []

  // Client-side domain filtering for blocked_domains
  if (blockedDomains && blockedDomains.length > 0) {
    results = results.filter((r) => {
      const linkLower = r.link.toLowerCase()
      return !blockedDomains.some((d) => linkLower.includes(d.toLowerCase()))
    })
  }

  return results
}
