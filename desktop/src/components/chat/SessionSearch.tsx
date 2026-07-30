/**
 * SessionSearch — 会话消息查找
 *
 * 模式类似文件浏览器的查找功能：
 * - 顶部关键词输入框
 * - 下方消息搜索结果列表
 * - 点击结果项回到对话模式并滚动到对应消息
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import type { UIMessage } from '../../types/chat';

type Props = {
  messages: UIMessage[];
  onSelectMessage: (messageId: string) => void;
  onClose: () => void;
};

type SearchMatch = {
  messageId: string;
  type: string;
  preview: string;
  index: number; // 在 messages 中的位置索引
};

/** 从消息中提取纯文本用于搜索 */
function getMessageText(msg: UIMessage): string {
  if (msg.type === 'user_text' || msg.type === 'assistant_text') {
    return msg.content;
  }
  if (msg.type === 'error') {
    return msg.message || '';
  }
  if (msg.type === 'thinking') {
    return msg.content || '';
  }
  return '';
}

/** 简单的角色标签 */
function getRoleLabel(type: string): string {
  switch (type) {
    case 'user_text': return 'You';
    case 'assistant_text': return 'AI';
    case 'thinking': return '思考';
    case 'error': return '错误';
    default: return '';
  }
}

/** 截取匹配上下文片段 */
function getPreviewSnippet(text: string, query: string): string {
  const lowerText = text.toLowerCase();
  const lowerQ = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQ);
  if (idx === -1) return text.slice(0, 120);

  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + query.length + 60);
  let snippet = text.slice(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}

export function SessionSearch({ messages, onSelectMessage, onClose }: Props) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase();
    const matches: SearchMatch[] = [];

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const text = getMessageText(msg);
      if (text.toLowerCase().includes(lowerQuery)) {
        const preview = getPreviewSnippet(text, query);
        matches.push({
          messageId: msg.id,
          type: msg.type,
          preview,
          index: i,
        });
      }
    }

    return matches;
  }, [messages, query]);

  const handleSelect = (match: SearchMatch) => {
    onSelectMessage(match.messageId);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search header */}
      <div className="shrink-0 px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-md p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors"
            title={t('session.searchClose')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="flex-1 flex items-center gap-2 rounded-lg bg-[var(--color-surface-container-high)] px-3 py-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-tertiary)] shrink-0">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('session.searchPlaceholder')}
              className="flex-1 min-w-0 bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="flex items-center justify-center rounded p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="shrink-0 px-4 py-2 border-b border-[var(--color-border)]">
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {query.trim()
            ? t('session.searchResults', { count: results.length })
            : t('session.searchHint')}
        </span>
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto">
        {results.length === 0 && query.trim() && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 text-[var(--color-text-tertiary)] opacity-40">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
              <p className="text-sm text-[var(--color-text-tertiary)]">{t('session.searchNoResults')}</p>
            </div>
          </div>
        )}

        {results.map((match, idx) => (
          <button
            key={`${match.messageId}-${idx}`}
            onClick={() => handleSelect(match)}
            className="w-full flex items-start gap-3 px-4 py-3 text-left border-b border-[var(--color-border)]/40 hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            {/* Role badge */}
            <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded leading-none ${
              match.type === 'user_text'
                ? 'bg-[var(--color-brand)]/10 text-[var(--color-brand)]'
                : match.type === 'assistant_text'
                ? 'bg-[var(--color-surface-container-high)] text-[var(--color-text-secondary)]'
                : 'bg-[var(--color-surface-container-high)] text-[var(--color-text-tertiary)]'
            }`}>
              {getRoleLabel(match.type)}
            </span>

            {/* Preview */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed line-clamp-2">
                {match.preview}
              </p>
            </div>

            {/* Message index */}
            <span className="shrink-0 text-[10px] text-[var(--color-text-tertiary)] tabular-nums mt-0.5">
              #{messages.length - match.index}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
