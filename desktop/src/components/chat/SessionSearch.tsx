/**
 * SessionSearch — 会话消息查找
 *
 * 模式类似文件浏览器的查找功能：
 * - 顶部关键词输入框 + 大小写/全字/正则切换
 * - 下方消息搜索结果列表
 * - 点击结果项回到对话模式并滚动到对应消息
 */

import { useMemo, useRef, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { Tooltip } from '../shared/Tooltip';
import type { UIMessage } from '../../types/chat';

type Props = {
  messages: UIMessage[];
  query: string;
  onQueryChange: (q: string) => void;
  caseSensitive: boolean;
  onCaseSensitiveChange: (v: boolean) => void;
  wholeWord: boolean;
  onWholeWordChange: (v: boolean) => void;
  useRegex: boolean;
  onUseRegexChange: (v: boolean) => void;
  onSelectMessage: (messageId: string) => void;
  onClose: () => void;
};

type SearchMatch = {
  messageId: string;
  type: string;
  preview: string;
  matchIndex: number;
  index: number;
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

/** 判断文本是否匹配查询 */
function matchText(text: string, query: string, caseSensitive: boolean, wholeWord: boolean, useRegex: boolean): { matched: boolean; matchIndex: number } {
  if (!query.trim()) return { matched: false, matchIndex: -1 };

  if (useRegex) {
    try {
      const re = new RegExp(query, caseSensitive ? 'g' : 'gi');
      const m = re.exec(text);
      return { matched: !!m, matchIndex: m?.index ?? -1 };
    } catch {
      return { matched: false, matchIndex: -1 };
    }
  }

  if (wholeWord) {
    const flags = caseSensitive ? '' : 'i';
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, flags);
    const m = re.exec(text);
    return { matched: !!m, matchIndex: m?.index ?? -1 };
  }

  // 普通子串匹配
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const idx = hay.indexOf(needle);
  return { matched: idx !== -1, matchIndex: idx };
}

/** 截取匹配上下文片段 */
function getPreviewSnippet(text: string, matchIndex: number, queryLen: number): string {
  if (matchIndex === -1) return text.slice(0, 120);

  const start = Math.max(0, matchIndex - 30);
  const end = Math.min(text.length, matchIndex + queryLen + 60);
  let snippet = text.slice(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}

export function SessionSearch({
  messages, query, onQueryChange,
  caseSensitive, onCaseSensitiveChange,
  wholeWord, onWholeWordChange,
  useRegex, onUseRegexChange,
  onSelectMessage, onClose,
}: Props) {
  const t = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    if (!query.trim()) return [];

    const matches: SearchMatch[] = [];

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const text = getMessageText(msg);
      const { matched, matchIndex } = matchText(text, query, caseSensitive, wholeWord, useRegex);
      if (matched) {
        // 对于正则，query.length 不是真实匹配长度，用 matchIndex + 估算
        const previewLen = useRegex ? Math.min(text.length - matchIndex, 80) : query.length;
        const preview = getPreviewSnippet(text, matchIndex, previewLen);
        matches.push({
          messageId: msg.id,
          type: msg.type,
          preview,
          matchIndex,
          index: i,
        });
      }
    }

    return matches;
  }, [messages, query, caseSensitive, wholeWord, useRegex]);

  const handleSelect = (match: SearchMatch) => {
    onSelectMessage(match.messageId);
  };

  const toggleBtn = (active: boolean, onClick: () => void, label: string, title: string) => (
    <Tooltip content={title}>
      <button
        onClick={onClick}
        className={`flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold shrink-0 transition-colors ${
          active
            ? 'text-[var(--color-brand)] bg-[var(--color-surface-selected)]'
            : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]'
        }`}
      >
        {label}
      </button>
    </Tooltip>
  );

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
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t('session.searchPlaceholder')}
              className="flex-1 min-w-0 bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
              spellCheck={false}
            />
            {query && (
              <button
                onClick={() => onQueryChange('')}
                className="flex items-center justify-center rounded p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          {/* Search option toggles */}
          <div className="flex items-center gap-1 shrink-0">
            {toggleBtn(caseSensitive, () => onCaseSensitiveChange(!caseSensitive), 'Aa', t('fileExplorer.caseSensitive'))}
            {toggleBtn(wholeWord, () => onWholeWordChange(!wholeWord), 'ab', t('fileExplorer.wholeWord'))}
            {toggleBtn(useRegex, () => onUseRegexChange(!useRegex), '.*', t('fileExplorer.useRegex'))}
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
