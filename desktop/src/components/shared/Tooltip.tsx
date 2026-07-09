import { memo, useRef, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

type TooltipProps = {
  content: string | undefined
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'right'
  delay?: number
  className?: string
}

/** Viewport-aware tooltip rendered via portal so it is never clipped by parent overflow. */
export const Tooltip = memo(function Tooltip({ content, children, side = 'top', delay = 400, className }: TooltipProps) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [adjustedSide, setAdjustedSide] = useState(side)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const tooltip = tooltipRef.current
    if (!trigger || !tooltip) return

    const triggerRect = trigger.getBoundingClientRect()
    const tooltipRect = tooltip.getBoundingClientRect()
    const gap = 6
    const vw = window.innerWidth
    const vh = window.innerHeight

    let currentSide = side

    const compute = (s: 'top' | 'bottom' | 'right') => {
      switch (s) {
        case 'top':
          return {
            top: triggerRect.top - tooltipRect.height - gap,
            left: triggerRect.left + (triggerRect.width - tooltipRect.width) / 2,
          }
        case 'bottom':
          return {
            top: triggerRect.bottom + gap,
            left: triggerRect.left + (triggerRect.width - tooltipRect.width) / 2,
          }
        case 'right':
          return {
            top: triggerRect.top + (triggerRect.height - tooltipRect.height) / 2,
            left: triggerRect.right + gap,
          }
      }
    }

    let pos = compute(currentSide)

    if (currentSide === 'top' && pos.top < 0) {
      currentSide = 'bottom'
      pos = compute(currentSide)
    } else if (currentSide === 'bottom' && pos.top + tooltipRect.height > vh) {
      currentSide = 'top'
      pos = compute(currentSide)
    } else if (currentSide === 'right' && pos.left + tooltipRect.width > vw) {
      currentSide = 'top'
      pos = compute(currentSide)
      if (pos.top < 0) {
        currentSide = 'bottom'
        pos = compute(currentSide)
      }
    }

    if (pos.left < 4) pos.left = 4
    if (pos.left + tooltipRect.width > vw - 4) pos.left = vw - 4 - tooltipRect.width

    if (pos.top < 4) pos.top = 4
    if (pos.top + tooltipRect.height > vh - 4) pos.top = vh - 4 - tooltipRect.height

    setPosition(pos)
    setAdjustedSide(currentSide)
  }, [side])

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      setVisible(true)
    }, delay)
  }, [delay])

  const hide = useCallback(() => {
    clearTimeout(timerRef.current)
    setVisible(false)
  }, [])

  useEffect(() => {
    if (!visible) return
    updatePosition()
    const onScrollOrResize = () => updatePosition()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [visible, updatePosition])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  if (!content) return <>{children}</>

  const arrowClass = (() => {
    switch (adjustedSide) {
      case 'top':
        return 'absolute left-1/2 -translate-x-1/2 top-full border-l-[6px] border-r-[6px] border-l-transparent border-r-transparent border-t-[6px] border-t-gray-400'
      case 'bottom':
        return 'absolute left-1/2 -translate-x-1/2 bottom-full border-l-[6px] border-r-[6px] border-l-transparent border-r-transparent border-b-[6px] border-b-gray-400'
      case 'right':
        return 'absolute top-1/2 -translate-y-1/2 right-full border-t-[6px] border-b-[6px] border-t-transparent border-b-transparent border-r-[6px] border-r-gray-400'
    }
  })()

  const tooltipEl = visible ? (
    <div
      ref={tooltipRef}
      role="tooltip"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <div className="rounded-lg border border-gray-400 bg-[var(--color-surface-container-lowest)] px-2.5 py-1.5 shadow-[var(--shadow-dropdown)] whitespace-nowrap">
        <span className="text-[11px] text-[var(--color-text-secondary)]">{content}</span>
      </div>
      <div className={arrowClass} />
    </div>
  ) : null

  return (
    <>
      <div
        ref={triggerRef}
        className={`inline-flex${className ? ` ${className}` : ''}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </div>
      {createPortal(tooltipEl, document.body)}
    </>
  )
})
