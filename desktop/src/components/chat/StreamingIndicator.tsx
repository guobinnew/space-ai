/**
 * StreamingIndicator — 流式思考指示器
 *
 * 参照 smart-code chat/StreamingIndicator.tsx。
 * 药丸形状，带 shimmer 动画图标。
 */

import { useTranslation } from '../../i18n';

export function StreamingIndicator() {
  const t = useTranslation();
  return (
    <div className="mb-2 ml-10 flex w-fit items-center gap-2 rounded-full border border-[var(--color-border)]/40 bg-[var(--color-surface-container-low)] px-3 py-1">
      <span className="text-[var(--color-brand)] animate-shimmer text-xs">✦</span>
      <span className="text-xs font-medium text-[var(--color-text-secondary)]">{t('chat.thinking')}</span>
    </div>
  );
}
