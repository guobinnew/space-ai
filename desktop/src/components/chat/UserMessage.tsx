/**
 * UserMessage — 用户消息气泡
 *
 * 参照 smart-code chat/UserMessage.tsx，添加复制功能。
 * 自动解析并渲染文件/代码引用标签。
 */

import { useMemo } from 'react';
import { useTranslation, localeTag } from '../../i18n';
import { MessageActionBar } from './MessageActionBar';
import { parseRefsFromContent, RefTagList } from './refParser';

export function UserMessage({ content, createdAt }: { content: string; createdAt: string }) {
  const t = useTranslation();
  const { refs, cleanContent } = useMemo(() => parseRefsFromContent(content), [content]);

  return (
    <div className="group flex items-end justify-end gap-1.5 mb-3">
      <div className="min-w-0 max-w-[80%]">
        <div className="rounded-xl px-4 py-3 text-base bg-[var(--color-surface-container-high)] text-[var(--color-text-primary)]">
          {/* Ref tags */}
          <RefTagList refs={refs} />
          {/* Clean content */}
          {cleanContent && (
            <div className="whitespace-pre-wrap break-words">{cleanContent}</div>
          )}
        </div>
        {createdAt && (
          <div className="flex items-center justify-end gap-2 mt-1 mr-1">
            <MessageActionBar
              copyText={content}
              copyLabel={t('chat.copy')}
            />
            <span className="text-[10px] text-[var(--color-text-tertiary)]">
              {new Date(createdAt).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
