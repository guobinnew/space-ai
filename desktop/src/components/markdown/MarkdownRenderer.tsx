/**
 * MarkdownRenderer — Markdown 渲染器
 *
 * 参照 smart-code markdown/MarkdownRenderer.tsx，简化版。
 * 使用 marked 解析 + DOMPurify 消毒 + 事件委托（复制按钮/链接）。
 * 去掉 MermaidRenderer/CodeViewer/editorStore 依赖。
 */

import { useEffect, useMemo, useCallback } from 'react'
import DOMPurify from 'dompurify'
import { marked, type Tokens } from 'marked'
import { useTranslation } from '../../i18n'

type Props = {
  content: string
  className?: string
}

type CodeBlock = {
  id: string
  code: string
  language: string | undefined
}

// ─── marked 配置 ─────────────────────────────────────────────

let pendingCodeBlocks: CodeBlock[] = []

const renderer = new marked.Renderer()

renderer.code = function ({ text, lang }: Tokens.Code) {
  const id = `cb-${pendingCodeBlocks.length}`
  pendingCodeBlocks.push({
    id,
    code: text,
    language: lang?.trim().split(/\s+/)[0]?.toLowerCase() || undefined,
  })
  return `<div data-codeblock-id="${id}"></div>`
}

marked.setOptions({
  breaks: true,
  gfm: true,
})
marked.use({ renderer })

// ─── 辅助函数 ─────────────────────────────────────────────────

/** 过滤 <system-reminder> 标签 */
function stripSystemReminders(text: string): string {
  const OPEN = '<system-reminder>'
  const CLOSE = '</system-reminder>'
  let result = text
  let openIdx = result.indexOf(OPEN)
  while (openIdx >= 0) {
    const closeIdx = result.indexOf(CLOSE, openIdx)
    if (closeIdx < 0) break
    result = result.slice(0, openIdx) + result.slice(closeIdx + CLOSE.length)
    openIdx = result.indexOf(OPEN)
  }
  return result
}

/** 解析 markdown，提取代码块 */
function parseMarkdown(content: string): { html: string; codeBlocks: CodeBlock[] } {
  pendingCodeBlocks = []
  const cleaned = stripSystemReminders(content)
  const html = marked.parse(cleaned) as string
  const codeBlocks = [...pendingCodeBlocks]
  pendingCodeBlocks = []
  return { html, codeBlocks }
}

/** 增强 HTML：表格包裹、链接处理 */
function enhanceHtml(html: string): string {
  const cleanHtml = DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel', 'data-copy-code'],
  })

  if (typeof document === 'undefined') return cleanHtml

  const container = document.createElement('div')
  container.innerHTML = cleanHtml

  // 表格包裹滚动容器
  container.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('md-table-wrap')) return
    const wrapper = document.createElement('div')
    wrapper.className = 'md-table-wrap'
    table.parentNode?.insertBefore(wrapper, table)
    wrapper.appendChild(table)
  })

  // 外部链接新窗口打开
  container.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href') || ''
    if (href.startsWith('#')) return
    if (!/^(https?:|mailto:|tel:|data:|\/\/)/i.test(href)) return
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noreferrer noopener')
  })

  return container.innerHTML
}

// ─── 组件 ─────────────────────────────────────────────────────

/** 全局样式注入（只注入一次） */
let stylesInjected = false
function injectStyles() {
  if (stylesInjected || typeof document === 'undefined') return
  stylesInjected = true
  const el = document.createElement('style')
  el.textContent = markdownStyles
  document.head.appendChild(el)
}

export function MarkdownRenderer({ content, className }: Props) {
  const t = useTranslation()
  useEffect(() => { injectStyles() }, [])
  const { html, codeBlocks } = useMemo(() => parseMarkdown(content), [content])

  // 将 HTML 按代码块占位符拆分，代码块用 React 组件渲染
  const parts = useMemo(() => {
    if (codeBlocks.length === 0) {
      return [{ type: 'html' as const, content: html }]
    }

    const result: Array<{ type: 'html'; content: string } | { type: 'code'; block: CodeBlock }> = []
    let remaining = html

    for (const block of codeBlocks) {
      const marker = `<div data-codeblock-id="${block.id}"></div>`
      const idx = remaining.indexOf(marker)
      if (idx === -1) continue

      const before = remaining.slice(0, idx)
      if (before) result.push({ type: 'html', content: before })
      result.push({ type: 'code', block })
      remaining = remaining.slice(idx + marker.length)
    }

    if (remaining) result.push({ type: 'html', content: remaining })
    return result
  }, [html, codeBlocks])

  // 增强 HTML：表格包裹、链接处理（仅在 content 变化时执行）
  const enhancedParts = useMemo(
    () => parts.map((part) =>
      part.type === 'html' ? { ...part, content: enhanceHtml(part.content) } : part
    ),
    [parts],
  )

  const handleClick = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null

    // 复制代码按钮
    const button = target?.closest<HTMLButtonElement>('[data-copy-code]')
    if (button) {
      const text = button.getAttribute('data-copy-code')
      if (text) {
        try {
          await navigator.clipboard.writeText(text)
          const original = button.textContent
          button.textContent = '✓'
          window.setTimeout(() => { button.textContent = original }, 1500)
        } catch { /* ignore */ }
      }
    }
  }, [])

  return (
    <div className={`markdown-prose ${className || ''}`} onClick={handleClick}>
      {enhancedParts.map((part, i) =>
        part.type === 'html' ? (
          <div key={i} dangerouslySetInnerHTML={{ __html: part.content }} />
        ) : (
          <CodeBlock key={part.block.id} block={part.block} t={t} />
        )
      )}
    </div>
  )
}

// ─── CSS 样式（模块级别常量，避免每次渲染重建）────────────

// ─── 代码块组件 ───────────────────────────────────────────────

function CodeBlock({ block, t }: { block: CodeBlock; t: (key: string, params?: Record<string, string | number>) => string }) {
  return (
    <div className="md-code-block">
      <div className="md-code-header">
        <span className="md-code-lang">{block.language || t('markdown.langText')}</span>
        <button
          data-copy-code={block.code}
          className="md-copy-btn"
          title={t('markdown.copy')}
        >
          {t('markdown.copy')}
        </button>
      </div>
      <pre className="md-code-pre">
        <code>{block.code}</code>
      </pre>
    </div>
  )
}

// ─── CSS 样式 ─────────────────────────────────────────────────

const markdownStyles = `
.markdown-prose {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-primary);
  word-break: break-word;
}
.markdown-prose > div:first-child > :first-child { margin-top: 0; }
.markdown-prose > div:last-child > :last-child { margin-bottom: 0; }
.markdown-prose h1 { font-size: 1.4em; font-weight: 700; margin: 1em 0 0.5em; }
.markdown-prose h2 { font-size: 1.25em; font-weight: 700; margin: 1em 0 0.5em; }
.markdown-prose h3 { font-size: 1.1em; font-weight: 600; margin: 0.8em 0 0.4em; }
.markdown-prose h4 { font-size: 1em; font-weight: 600; margin: 0.6em 0 0.3em; }
.markdown-prose h5, .markdown-prose h6 { font-size: 0.9em; font-weight: 600; margin: 0.6em 0 0.3em; }
.markdown-prose p { margin: 0.5em 0; }
.markdown-prose ul { list-style: disc; padding-left: 1.4em; margin: 0.5em 0; }
.markdown-prose ol { list-style: decimal; padding-left: 1.4em; margin: 0.5em 0; }
.markdown-prose li { margin: 0.2em 0; }
.markdown-prose li > ul, .markdown-prose li > ol { margin: 0.2em 0; }
.markdown-prose a { color: var(--color-brand); text-decoration: none; }
.markdown-prose a:hover { text-decoration: underline; }
.markdown-prose strong { font-weight: 600; color: var(--color-text-primary); }
.markdown-prose em { font-style: italic; }
.markdown-prose blockquote {
  border-left: 3px solid var(--color-border);
  padding-left: 1em;
  margin: 0.5em 0;
  color: var(--color-text-secondary);
}
.markdown-prose hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 1em 0;
}
.markdown-prose code:not(.md-code-block code) {
  font-family: var(--font-mono), monospace;
  font-size: 0.88em;
  background: var(--color-surface-container-high);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 1px 5px;
}
.markdown-prose .md-table-wrap {
  overflow-x: auto;
  margin: 0.6em 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}
.markdown-prose table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
.markdown-prose th {
  background: var(--color-surface-container-low);
  padding: 6px 10px;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  font-weight: 600;
}
.markdown-prose td { padding: 6px 10px; border-bottom: 1px solid var(--color-border); }
.markdown-prose tr:last-child td { border-bottom: none; }

/* 代码块 */
.markdown-prose .md-code-block {
  margin: 0.6em 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}
.markdown-prose .md-code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  background: var(--color-surface-container-low);
  border-bottom: 1px solid var(--color-border);
}
.markdown-prose .md-code-lang {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-tertiary);
  font-family: var(--font-mono), monospace;
}
.markdown-prose .md-copy-btn {
  font-size: 10px;
  color: var(--color-text-tertiary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s;
}
.markdown-prose .md-copy-btn:hover {
  color: var(--color-text-primary);
  background: var(--color-surface-hover);
}
.markdown-prose .md-code-pre {
  margin: 0;
  padding: 10px 12px;
  background: var(--color-surface-container-lowest);
  overflow-x: auto;
  font-family: var(--font-mono), monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-primary);
}
.markdown-prose .md-code-pre code { background: none; border: none; padding: 0; font-size: inherit; }
`
