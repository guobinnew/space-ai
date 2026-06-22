/**
 * StreamingIndicator — 流式思考指示器
 *
 * 参照 smart-code chat/StreamingIndicator.tsx 复刻。
 */

export function StreamingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-xl px-4 py-3 text-sm bg-[var(--color-surface-container-low)] border border-[var(--color-border)] text-[var(--color-text-tertiary)]">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand)] animate-pulse-dot" />
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand)] animate-pulse-dot" style={{ animationDelay: '0.2s' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand)] animate-pulse-dot" style={{ animationDelay: '0.4s' }} />
          <span className="ml-1">思考中...</span>
        </div>
      </div>
    </div>
  );
}
