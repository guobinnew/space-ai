/**
 * ThinkingBlock — 思考过程块
 *
 * 参照 smart-code chat/ThinkingBlock.tsx，简化版。
 * 显示"思考中"状态，带动画光标。可折叠。
 */

import { useState } from 'react';
import { useTranslation } from '../../i18n';

type Props = {
  isActive?: boolean;
};

export function ThinkingBlock({ isActive = false }: Props) {
  const t = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-2 ml-10">
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
        {isActive && !expanded && (
          <span className="thinking-inline-cursor" />
        )}
      </button>
      {expanded && (
        <div className="mt-1 rounded-lg border border-[var(--color-border)]/40 bg-[var(--color-surface-container-lowest)] p-2.5 font-mono text-[11px] leading-[1.35] text-[var(--color-text-secondary)]">
          {isActive ? (
            <span className="thinking-cursor-container">
              正在分析任务，规划工具调用步骤...
              <span className="thinking-cursor" />
            </span>
          ) : (
            <span className="text-[var(--color-text-tertiary)]">思考过程已完成</span>
          )}
        </div>
      )}
    </div>
  );
}

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
