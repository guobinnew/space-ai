/**
 * AssistantMessage — 助手消息气泡
 *
 * 参照 smart-code chat/AssistantMessage.tsx 复刻。
 * 使用 MarkdownRenderer 渲染 markdown 内容。
 */

import { MarkdownRenderer } from '../markdown/MarkdownRenderer';

export function AssistantMessage({
  content,
  createdAt,
  streaming,
}: {
  content: string;
  createdAt: string;
  streaming?: boolean;
}) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-xl px-4 py-2.5 text-sm bg-[var(--color-surface-container-low)] border border-[var(--color-border)] text-[var(--color-text-primary)]">
        <MarkdownRenderer content={content} />
        {streaming && (
          <span className="inline-block w-1.5 h-4 ml-0.5 bg-[var(--color-brand)] animate-pulse align-middle" />
        )}
        {createdAt && !streaming && (
          <div className="text-[10px] text-[var(--color-text-tertiary)] mt-1">
            {new Date(createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}
