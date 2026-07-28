/**
 * ReadingPanel — 朗读模式面板
 *
 * 显示分段文本，高亮当前朗读段，自动滚动。
 * 控制按钮：暂停/继续、重新开始、停止。
 */
import { useRef, useEffect } from 'react'
import type { useTTS } from '../../hooks/useTTS'

type Props = {
  tts: ReturnType<typeof useTTS>
}

export function ReadingPanel({ tts }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const segRefs = useRef<(HTMLDivElement | null)[]>([])

  // 自动滚动到当前段
  useEffect(() => {
    if (tts.currentIndex < 0) return
    const el = segRefs.current[tts.currentIndex]
    if (el && scrollRef.current) {
      const container = scrollRef.current
      const elTop = el.offsetTop
      const elHeight = el.offsetHeight
      const scrollTop = container.scrollTop
      const viewportHeight = container.clientHeight
      // 只在当前段不在视口内时滚动
      if (elTop < scrollTop || elTop + elHeight > scrollTop + viewportHeight) {
        container.scrollTo({ top: elTop - viewportHeight / 2 + elHeight / 2, behavior: 'smooth' })
      }
    }
  }, [tts.currentIndex])

  if (tts.segments.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-tertiary)]">
          朗读已停止
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 控制栏 */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-container-low)]">
        {/* 状态指示 */}
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
          {tts.isLoading && <span className="animate-spin w-3 h-3 border-2 border-[var(--color-brand)] border-t-transparent rounded-full" />}
          <span className="font-medium">
            {tts.state === 'playing' ? '朗读中' : tts.state === 'paused' ? '已暂停' : tts.state === 'loading' ? '加载中' : tts.state === 'error' ? '错误' : '就绪'}
          </span>
          {tts.progress.total > 0 && (
            <span className="text-[var(--color-text-tertiary)] tabular-nums">
              {tts.progress.current} / {tts.progress.total}
            </span>
          )}
        </div>

        {/* 控制按钮 */}
        <div className="ml-auto flex items-center gap-1">
          {/* 暂停/继续 */}
          {tts.isPlaying && (
            <button onClick={tts.pause}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" /></svg>
              暂停
            </button>
          )}
          {tts.isPaused && (
            <button onClick={tts.resume}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-[var(--color-brand)] hover:bg-[var(--color-brand)]/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
              继续
            </button>
          )}

          {/* 重新开始 */}
          {(tts.isPlaying || tts.isPaused) && (
            <button onClick={tts.restart}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              重来
            </button>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {tts.error && (
        <div className="px-4 py-2 text-xs text-[var(--color-error)] bg-[var(--color-error)]/8 border-b border-[var(--color-error)]/15">
          {tts.error}
        </div>
      )}

      {/* 分段文本 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {tts.segments.map((seg, i) => {
          const isCurrent = i === tts.currentIndex
          const isRead = i < tts.currentIndex
          return (
            <div
              key={i}
              ref={(el) => { segRefs.current[i] = el }}
              className={`px-4 py-3 rounded-lg text-sm leading-relaxed transition-all duration-300 ${
                isCurrent
                  ? 'bg-[var(--color-brand)]/10 border-l-[3px] border-[var(--color-brand)] text-[var(--color-text-primary)]'
                  : isRead
                    ? 'text-[var(--color-text-tertiary)] opacity-60'
                    : 'text-[var(--color-text-secondary)]'
              }`}
            >
              {seg}
            </div>
          )
        })}
      </div>
    </div>
  )
}
