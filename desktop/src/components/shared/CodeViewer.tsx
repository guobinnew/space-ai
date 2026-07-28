/**
 * CodeViewer — 代码预览组件
 *
 * 简化版：使用 <pre> + 行号，不依赖 shiki 高亮库。
 * 复刻 smart-code CodeViewer 的布局和交互。
 */

import { useState, useCallback } from 'react'

type Props = {
  code: string
  language: string
  filename?: string
  className?: string
}

export function CodeViewer({ code, language, filename, className = '' }: Props) {
  const [copied, setCopied] = useState(false)
  const lines = code.split('\n')
  // 去掉末尾空行
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }, [code])

  return (
    <div className={`code-viewer ${className}`}>
      <div className="code-viewer-header">
        <span className="code-viewer-lang">{language}</span>
        {filename && <span className="code-viewer-filename">{filename}</span>}
        <button
          onClick={handleCopy}
          className="code-viewer-copy"
          title={copied ? '已复制' : '复制代码'}
        >
          {copied ? '✓' : '复制'}
        </button>
      </div>
      <div className="code-viewer-body">
        <pre className="code-viewer-pre">
          <code>
            {lines.map((line, i) => (
              <div key={i} className="code-viewer-line">
                <span className="code-viewer-line-num">{i + 1}</span>
                <span className="code-viewer-line-text">{line}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>
      <style>{codeViewerStyles}</style>
    </div>
  )
}

const codeViewerStyles = `
.code-viewer {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-surface-container-lowest);
}
.code-viewer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--color-surface-container-low);
  border-bottom: 1px solid var(--color-border);
}
.code-viewer-lang {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-tertiary);
  font-family: var(--font-mono), monospace;
}
.code-viewer-filename {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-family: var(--font-mono), monospace;
}
.code-viewer-copy {
  margin-left: auto;
  font-size: 11px;
  color: var(--color-text-tertiary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  transition: all 0.15s;
}
.code-viewer-copy:hover {
  color: var(--color-text-primary);
  background: var(--color-surface-hover);
}
.code-viewer-body {
  overflow-x: auto;
  max-height: 600px;
  overflow-y: auto;
}
.code-viewer-pre {
  margin: 0;
  padding: 12px;
  font-family: var(--font-mono), monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-primary);
}
.code-viewer-pre code {
  background: none;
  border: none;
  padding: 0;
  font-size: inherit;
}
.code-viewer-line {
  display: flex;
  min-height: 1.6em;
}
.code-viewer-line-num {
  flex-shrink: 0;
  width: 40px;
  text-align: right;
  padding-right: 12px;
  color: var(--color-text-quaternary, var(--color-text-tertiary));
  user-select: none;
  opacity: 0.5;
}
.code-viewer-line-text {
  flex: 1;
  white-space: pre;
}
`
