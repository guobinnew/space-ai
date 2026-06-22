/**
 * ActiveSession — 活跃会话页面
 *
 * 参照 smart-code ActiveSession.tsx 复刻。
 * 使用 chatStore 管理流式状态，通过 WebSocket 与后端通信。
 */

import { useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';
import { MessageList } from '../components/chat/MessageList';
import { ChatInput } from '../components/chat/ChatInput';

export function ActiveSession({ sessionId }: { sessionId: string }) {
  const { connectToSession, disconnectSession, sendMessage, stopGeneration, getSession } = useChatStore();
  const { closeTab } = useUIStore();

  const sessionState = getSession(sessionId);
  const isGenerating = sessionState.chatState === 'thinking' || sessionState.chatState === 'streaming';

  useEffect(() => {
    connectToSession(sessionId);
    return () => {
      disconnectSession(sessionId);
    };
  }, [sessionId, connectToSession, disconnectSession]);

  const handleSend = (content: string) => {
    sendMessage(sessionId, content);
  };

  const handleStop = () => {
    stopGeneration(sessionId);
  };

  const handleClose = () => {
    disconnectSession(sessionId);
    closeTab(sessionId);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)] flex-shrink-0">
        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          会话
        </span>
        <button
          onClick={handleClose}
          className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-colors"
        >
          关闭
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
