/**
 * ActiveSession — 活跃会话页面
 *
 * 参照 smart-code ActiveSession.tsx 复刻。
 * 使用 chatStore 管理流式状态，通过 WebSocket 与后端通信。
 */

import { useEffect, useRef } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';
import { MessageList } from '../components/chat/MessageList';
import { ChatInput } from '../components/chat/ChatInput';
import { useTranslation } from '../i18n';

export function ActiveSession({ sessionId }: { sessionId: string }) {
  const t = useTranslation();
  const { connectToSession, disconnectSession, sendMessage, stopGeneration, getSession } = useChatStore();
  const { closeTab } = useUIStore();
  // Use a ref to track if this is the first mount vs a re-render cleanup
  const isConnectedRef = useRef(false);

  const sessionState = getSession(sessionId);
  const isGenerating = sessionState.chatState === 'thinking' || sessionState.chatState === 'streaming';

  // Only connect/disconnect when sessionId changes — NOT on every render
  useEffect(() => {
    // Skip re-connecting if already connected (React StrictMode double-mount guard)
    if (isConnectedRef.current) return
    isConnectedRef.current = true

    connectToSession(sessionId)

    return () => {
      isConnectedRef.current = false
      disconnectSession(sessionId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const handleSend = (content: string) => {
    sendMessage(sessionId, content);
  };

  const handleStop = () => {
    stopGeneration(sessionId);
  };

  const handleClose = () => {
    // 仅关闭 tab；WS 断开由组件卸载时的 cleanup 统一处理，
    // 这样切换 tab 不断开 WS，只有关闭 tab 才断开。
    closeTab(sessionId);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)] flex-shrink-0">
        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {t('session.title')}
        </span>
        <button
          onClick={handleClose}
          className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-colors"
        >
          {t('session.close')}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6">
        <MessageList
          messages={sessionState.messages}
          streamingText={sessionState.streamingText}
          chatState={sessionState.chatState}
        />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-[var(--color-border)] flex-shrink-0">
        <ChatInput
          onSend={handleSend}
          onStop={handleStop}
          isGenerating={isGenerating}
        />
      </div>
    </div>
  );
}
