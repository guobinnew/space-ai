import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { copyTextToClipboard } from '../chat/clipboard'
import { useTranslation } from '../../i18n'
import { Tooltip } from './Tooltip'

type Props = {
  text: string
  label?: string
  copiedLabel?: string
  displayLabel?: ReactNode
  displayCopiedLabel?: ReactNode
  className?: string
}

export function CopyButton({
  text,
  label,
  copiedLabel,
  displayLabel,
  displayCopiedLabel,
  className = '',
}: Props) {
  const t = useTranslation()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  const handleCopy = async () => {
    try {
      const ok = await copyTextToClipboard(text)
      if (!ok) { setCopied(false); return }
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const currentLabel = copied
    ? (copiedLabel ?? t('common.copied'))
    : (label ?? t('common.copy'))
  const buttonText = copied
    ? (displayCopiedLabel ?? copiedLabel ?? t('common.copied'))
    : (displayLabel ?? label ?? t('common.copy'))

  return (
    <Tooltip content={currentLabel}>
      <button type="button" onClick={handleCopy} className={className} aria-label={currentLabel}>
        {buttonText}
      </button>
    </Tooltip>
  )
}
