import { useState } from 'react'
import { copyTextToClipboard } from './clipboard'
import { useTranslation } from '../../i18n'

type Props = {
  /** 要复制的文本内容 */
  copyText?: string
  /** 复制按钮的 aria-label */
  copyLabel: string
}

/** 消息操作的浮动按钮栏：hover 时显示复制按钮 */
export function MessageActionBar({ copyText, copyLabel }: Props) {
  const [copied, setCopied] = useState(false)
  const t = useTranslation()
  const hasCopy = Boolean(copyText?.trim())

  const handleCopy = async () => {
    if (!copyText) return
    try {
      const ok = await copyTextToClipboard(copyText)
      if (ok) {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }
    } catch {
      // ignore
    }
  }

  if (!hasCopy) return null

  return (
    <div className="shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 flex items-center">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copyLabel}
        title={copied ? t('chat.copied') : copyLabel}
        className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)]/70 bg-[var(--color-surface)] p-1 text-[10px] text-[var(--color-text-tertiary)] transition-colors hover:border-[var(--color-brand)]/35 hover:text-[var(--color-brand)]"
      >
        {copied ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  )
}
