/**
 * ChatInput — 聊天输入框
 *
 * 参照 smart-code chat/ChatInput.tsx 复刻，简化版。
 * 支持 Enter 发送、Shift+Enter 换行、停止生成。
 */

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../../i18n';

type ChatInputProps = {
  onSend: (content: string) => void;
  onStop: () => void;
  isGenerating: boolean;
  disabled?: boolean;
};

export function ChatInput({ onSend, onStop, isGenerating, disabled }: ChatInputProps) {
  const t = useTranslation();
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [input]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || isGenerating || disabled) return;
    onSend(text);
    setInput('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-end gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-3 focus-within:border-[var(--color-border-focus)] transition-colors">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="flex-1 resize-none border-0 bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] disabled:opacity-50"
          placeholder={t('session.placeholder')}
          rows={1}
          style={{ maxHeight: '120px' }}
        />
        {isGenerating ? (
          <button
            onClick={onStop}
            className="flex-shrink-0 px-4 py-1.5 text-xs font-semibold rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            {t('session.stop')}
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || disabled}
            className="flex-shrink-0 px-4 py-1.5 text-xs font-semibold rounded-lg text-[var(--color-btn-primary-fg)] transition-all hover:brightness-105 disabled:opacity-30"
            style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
          >
            {t('session.send')}
          </button>
        )}
      </div>
    </div>
  );
}
