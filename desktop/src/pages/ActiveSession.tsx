/**
 * ActiveSession — 活跃会话页面
 *
 * 参照 smart-code ActiveSession.tsx 复刻，简化版。
 * 显示消息列表 + 输入框。
 */

import { useState, useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useUIStore } from '../stores/uiStore';
import type { ChatMessage } from '../types/session';

export function ActiveSession({ sessionId }: { sessionId: string }) {
  const { messages, loadMessages, sendMessage, deleteSession, renameSession } = useSessionStore();
  const { closeTab } = useUIStore();
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sessionMessages = messages[sessionId] || [];

  useEffect(() => {
    void loadMessages(sessionId);
  }, [sessionId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessionMessages.length]);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isSubmitting) return;
    setIsSubmitting(true);
    setInput('');
    try {
      await sendMessage(sessionId, text);
    } finally {
      setIsSubmitting(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('确定删除此会话吗？')) return;
    await deleteSession(sessionId);
    closeTab(sessionId);
  };

  const handleStartRename = () => {
    setIsRenaming(true);
    setRenameValue('');
  };

  const handleFinishRename = async () => {
    if (renameValue.trim()) {
      await renameSession(sessionId, renameValue.trim());
    }
    setIsRenaming(false);
    setRenameValue('');
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleFinishRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFinishRename();
                if (e.key === 'Escape') {
                  setIsRenaming(false);
                  setRenameValue('');
                }
              }}
              className="text-sm font-medium px-2 py-1 rounded border border-[var(--color-border-focus)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none"
              placeholder="新标题"
            />
          ) : (
            <button
              onClick={handleStartRename}
              className="text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-brand)] transition-colors truncate"
              title="点击重命名"
            >
              会话
            </button>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-colors"
        >
          删除会话
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {sessionMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div
              className="h-16 w-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mb-4"
              style={{ background: 'var(--gradient-btn-primary)' }}
            >
              S
            </div>
            <p className="text-sm text-[var(--color-text-tertiary)]">开始新对话</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto flex flex-col gap-4">
            {sessionMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-[var(--color-border)] flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-3 focus-within:border-[var(--color-border-focus)] transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 resize-none border-0 bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
              placeholder="输入消息，Enter 发送，Shift+Enter 换行"
              rows={1}
              style={{ maxHeight: '120px' }}
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isSubmitting}
              className="flex-shrink-0 px-4 py-1.5 text-xs font-semibold rounded-lg text-[var(--color-btn-primary-fg)] transition-all hover:brightness-105 disabled:opacity-30"
              style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
            >
              {isSubmitting ? '发送中...' : '发送'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
          isUser
            ? 'bg-[var(--color-surface-container-high)] text-[var(--color-text-primary)]'
            : 'bg-[var(--color-surface-container-low)] border border-[var(--color-border)] text-[var(--color-text-primary)]'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        <div className="text-[10px] text-[var(--color-text-tertiary)] mt-1">
          {new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
