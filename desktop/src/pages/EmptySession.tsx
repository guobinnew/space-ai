/**
 * EmptySession — 空会话页面
 *
 * 参照 smart-code EmptySession.tsx 复刻。
 * 居中欢迎信息 + 输入框，输入后创建新会话并连接 WS。
 */

import { useState, useRef } from 'react';
import { useTranslation } from '../i18n';
import { useSessionStore } from '../stores/sessionStore';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';

export function EmptySession() {
  const t = useTranslation();
  const { createSession } = useSessionStore();
  const { connectToSession, sendMessage } = useChatStore();
  const { openTab, defaultWorkDir } = useUIStore();
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const sessionId = await createSession(defaultWorkDir || undefined);
      openTab(sessionId, '新会话', 'session');
      connectToSession(sessionId);
      // Small delay to let WS connect
      setTimeout(() => {
        sendMessage(sessionId, text);
      }, 300);
    } catch (err) {
      console.error('Failed to create session:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--color-surface)]">
      {/* Center content */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-8 py-8">
        <div className="flex flex-col items-center gap-6">
          <div className="flex max-w-md flex-col items-center text-center">
            <div
              className="mb-6 h-20 w-20 rounded-[22px] flex items-center justify-center text-white text-3xl font-bold"
              style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-dropdown)' }}
            >
              S
            </div>
            <h1
              className="mb-2 text-2xl font-bold tracking-tight text-[var(--color-text-primary)]"
              style={{ fontFamily: 'var(--font-headline)' }}
            >
              {t('empty.title')}
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('empty.subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Input area */}
      <div className="flex justify-center px-8 pb-6">
        <div className="w-full max-w-3xl">
          <div className="flex items-end gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-3 focus-within:border-[var(--color-border-focus)] transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 resize-none border-0 bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
              placeholder={t('empty.placeholder')}
              rows={2}
              style={{ maxHeight: '120px' }}
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isSubmitting}
              className="flex-shrink-0 px-4 py-1.5 text-xs font-semibold rounded-lg text-[var(--color-btn-primary-fg)] transition-all hover:brightness-105 disabled:opacity-30"
              style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
            >
              {isSubmitting ? t('chat.creating') : t('session.send')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
