/**
 * MessageList — 消息列表组件
 *
 * 参照 smart-code chat/MessageList.tsx 复刻，简化版。
 * 渲染用户消息、助手消息、错误消息和流式文本。
 */

import { useEffect, useRef } from 'react';
import type { UIMessage, ChatState } from '../../types/chat';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { StreamingIndicator } from './StreamingIndicator';
import { useTranslation } from '../../i18n';

type MessageListProps = {
  messages: UIMessage[];
  streamingText: string;
  chatState: ChatState;
};

export function MessageList({ messages, streamingText, chatState }: MessageListProps) {
  const t = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingText]);

  if (messages.length === 0 && !streamingText && chatState === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div
          className="h-16 w-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mb-4"
          style={{ background: 'var(--gradient-btn-primary)' }}
        >
          S
        </div>
        <p className="text-sm text-[var(--color-text-tertiary)]">{t('chat.empty')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4 py-4">
      {messages.map((msg) => {
        if (msg.type === 'user_text') {
          return <UserMessage key={msg.id} content={msg.content} createdAt={msg.createdAt} />;
        }
        if (msg.type === 'assistant_text') {
          return <AssistantMessage key={msg.id} content={msg.content} createdAt={msg.createdAt} />;
        }
        if (msg.type === 'error') {
          return (
            <div key={msg.id} className="flex justify-start">
              <div className="max-w-[80%] rounded-xl px-4 py-2.5 text-sm border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 text-[var(--color-error)]">
                {msg.message}
              </div>
            </div>
          );
        }
        return null;
      })}

      {/* Streaming text */}
      {streamingText && (
        <AssistantMessage content={streamingText} createdAt="" streaming />
      )}

      {/* Thinking indicator */}
      {chatState === 'thinking' && !streamingText && (
        <StreamingIndicator />
      )}

      <div ref={endRef} />
    </div>
  );
}
