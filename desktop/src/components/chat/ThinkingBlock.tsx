/**
 * ThinkingBlock — 思考过程块
 *
 * 参照 smart-code chat/ThinkingBlock.tsx。
 * 支持实际思考内容显示，带预览、折叠、窗口化渲染。
 */

import { useState, useEffect, useRef, useMemo, useLayoutEffect, memo, Component, type ReactNode } from 'react';
import { useTranslation, translate } from '../../i18n';

const WINDOW_SIZE = 15000;
const CHUNK_SIZE = 15000;
const STREAMING_THROTTLE_CHARS = 5;

class ThinkingErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(err: Error) {
    console.error('[ThinkingBlock] render error:', err.message)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="mt-1 rounded-lg border border-[var(--color-border)]/40 bg-[var(--color-surface-container-lowest)] p-2.5 text-[11px] text-[var(--color-text-tertiary)]">
          {translate('thinking.tooLarge')}
        </div>
      )
    }
    return this.props.children
  }
}

function ThinkingBlockInner({ content, isActive = false }: { content?: string; isActive?: boolean }) {
  const t = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [windowStart, setWindowStart] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevContentLenRef = useRef((content || '').length);
  const prevIsActiveRef = useRef(isActive);
  const scrollSaveRef = useRef<{ top: number; height: number } | null>(null);

  const actualContent = content || '';

  // Reset window to tail when streaming starts
  if (isActive && !prevIsActiveRef.current) {
    prevIsActiveRef.current = isActive;
    prevContentLenRef.current = actualContent.length;
    const tail = Math.max(0, actualContent.length - WINDOW_SIZE);
    if (windowStart !== tail) setWindowStart(tail);
  } else {
    prevIsActiveRef.current = isActive;
  }

  // During streaming: slide window to follow the tail
  if (isActive && actualContent.length !== prevContentLenRef.current) {
    prevContentLenRef.current = actualContent.length;
    const tail = Math.max(0, actualContent.length - WINDOW_SIZE);
    if (windowStart !== tail) setWindowStart(tail);
  }

  // When streaming ends: reset window to tail of final content
  if (!isActive && prevContentLenRef.current !== actualContent.length) {
    prevContentLenRef.current = actualContent.length;
    const tail = Math.max(0, actualContent.length - WINDOW_SIZE);
    if (windowStart !== tail) setWindowStart(tail);
  }

  // Auto-scroll to bottom during streaming (only when viewing tail)
  useEffect(() => {
    if (expanded && isActive && contentRef.current && windowStart + WINDOW_SIZE >= actualContent.length) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [actualContent, expanded, isActive, windowStart]);

  // Preserve scroll position when earlier content is prepended
  useLayoutEffect(() => {
    const el = contentRef.current;
    const saved = scrollSaveRef.current;
    if (!el || !saved) return;
    scrollSaveRef.current = null;
    el.scrollTop = saved.top + (el.scrollHeight - saved.height);
  }, [windowStart]);

  const preview = useMemo(() => {
    if (!actualContent) return '';
    const idx = actualContent.indexOf('\n');
    const firstLine = (idx >= 0 ? actualContent.slice(0, idx) : actualContent).replace(/\s+/g, ' ').trim();
    return firstLine.length > 80 ? firstLine.slice(0, 80) + '...' : firstLine;
  }, [actualContent]);

  const hasEarlier = windowStart > 0;
  const displayContent = actualContent.slice(windowStart);

  const loadEarlier = () => {
    const el = contentRef.current;
    if (el) {
      scrollSaveRef.current = { top: el.scrollTop, height: el.scrollHeight };
    }
    setWindowStart((prev) => Math.max(0, prev - CHUNK_SIZE));
  };

  return (
    <div className="mb-1 ml-10">
      <style>{thinkingStyles}</style>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-[12px] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-secondary)]"
      >
        <span className="text-[10px]">
          {expanded ? '▾' : '▸'}
        </span>
        <span className="shrink-0 font-medium italic">
          {t('thinking.label')}
          {isActive && <span className="thinking-dots" />}
        </span>
        {!expanded && preview && (
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--color-text-tertiary)]">
            {preview}
            {isActive && <span className="thinking-inline-cursor" />}
          </span>
        )}
        {!expanded && !preview && isActive && (
          <span className="thinking-inline-cursor" />
        )}
      </button>
      {expanded && (
        <ThinkingErrorBoundary>
          <div
            ref={contentRef}
            className="mt-1 max-h-[300px] overflow-y-auto rounded-lg border border-[var(--color-border)]/40 bg-[var(--color-surface-container-lowest)] p-2.5 font-mono text-[11px] leading-[1.35] text-[var(--color-text-secondary)] whitespace-pre-wrap break-words"
          >
            {hasEarlier && (
              <button
                onClick={loadEarlier}
                className="mb-2 block w-full rounded px-2 py-1 text-center text-[11px] text-[var(--color-brand)] hover:bg-[var(--color-surface-container)]/60 hover:underline"
              >
                {t('thinking.showEarlier', { n: Math.round(windowStart / 1000) })}
              </button>
            )}
            {displayContent || (isActive ? t('thinking.analyzing') : t('thinking.completed'))}
            {isActive && expanded && <span className="thinking-cursor" />}
          </div>
        </ThinkingErrorBoundary>
      )}
    </div>
  );
}

export const ThinkingBlock = memo(ThinkingBlockInner, (prev, next) => {
  if (prev.isActive !== next.isActive) return false;
  if (!next.isActive) return (prev.content || '') === (next.content || '');
  return Math.abs((next.content || '').length - (prev.content || '').length) < STREAMING_THROTTLE_CHARS;
});

const thinkingStyles = `
@keyframes thinking-cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
@keyframes thinking-dots {
  0%, 20% { content: ''; }
  40% { content: '.'; }
  60% { content: '..'; }
  80%, 100% { content: '...'; }
}
.thinking-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--color-text-tertiary);
  vertical-align: middle;
  margin-left: 1px;
  animation: thinking-cursor-blink 1s step-end infinite;
}
.thinking-inline-cursor {
  display: inline-block;
  width: 1px;
  height: 0.95em;
  margin-left: 3px;
  vertical-align: text-bottom;
  background: var(--color-text-tertiary);
  animation: thinking-cursor-blink 1s step-end infinite;
}
.thinking-dots::after {
  content: '';
  animation: thinking-dots 1.4s steps(1, end) infinite;
}
`;
