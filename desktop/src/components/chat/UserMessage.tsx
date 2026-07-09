/**
 * UserMessage — 用户消息气泡
 *
 * 参照 smart-code chat/UserMessage.tsx，添加复制功能。
 */

import { useTranslation } from '../../i18n';
import { MessageActionBar } from './MessageActionBar';

export function UserMessage({ content, createdAt }: { content: string; createdAt: string }) {
  const t = useTranslation();

  return (
    <div className="group flex items-end justify-end gap-1.5 mb-3">
      <div className="min-w-0 max-w-[80%]">
        <div className="rounded-xl px-4 py-2.5 text-sm bg-[var(--color-surface-container-high)] text-[var(--color-text-primary)]">
          <div className="whitespace-pre-wrap break-words">{content}</div>
        </div>
        {createdAt && (
          <div className="flex items-center justify-end gap-2 mt-1 mr-1">
            <MessageActionBar
              copyText={content}
              copyLabel={t('chat.copy')}
            />
            <span className="text-[10px] text-[var(--color-text-tertiary)]">
              {new Date(createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
