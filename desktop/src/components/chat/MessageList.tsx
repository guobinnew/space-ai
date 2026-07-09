/**
 * MessageList — 消息列表组件
 *
 * 参照 smart-code chat/MessageList.tsx，适配版。
 * 渲染用户消息、助手消息（带头像）、思考块、工具调用块和流式文本。
 */

import { useEffect, useRef } from 'react';
import type { UIMessage, ChatState, ToolCallInfo, PendingQuestion, PendingPlan } from '../../types/chat';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { StreamingIndicator } from './StreamingIndicator';
import { ToolCallBlock } from './ToolCallBlock';
import { ThinkingBlock } from './ThinkingBlock';
import { AskUserQuestionModal } from './AskUserQuestionModal';
import { PlanApprovalModal } from './PlanApprovalModal';
import { useTranslation } from '../../i18n';

type MessageListProps = {
  messages: UIMessage[];
  streamingText: string;
  thinkingText: string;
  chatState: ChatState;
  toolCalls: ToolCallInfo[];
  pendingQuestion: PendingQuestion | null;
  pendingPlan: PendingPlan | null;
  onAnswerQuestion: (answer: string) => void;
  onRespondPlan: (response: string) => void;
};

export function MessageList({
  messages,
  streamingText,
  thinkingText,
  chatState,
  toolCalls,
  pendingQuestion,
  pendingPlan,
  onAnswerQuestion,
  onRespondPlan,
}: MessageListProps) {
  const t = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingText, thinkingText, toolCalls.length]);

  if (messages.length === 0 && !streamingText && chatState === 'idle' && toolCalls.length === 0) {
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

  const hasRunningTool = toolCalls.some((tc) => tc.status === 'running');
  const isThinking = chatState === 'thinking';

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-3 py-4">
      {messages.map((msg) => {
        if (msg.type === 'user_text') {
          return <UserMessage key={msg.id} content={msg.content} createdAt={msg.createdAt} />;
        }
        if (msg.type === 'assistant_text') {
          return <AssistantMessage key={msg.id} content={msg.content} createdAt={msg.createdAt} />;
        }
        if (msg.type === 'error') {
          return (
            <div key={msg.id} className="flex justify-start ml-10">
              <div className="max-w-[80%] rounded-xl px-4 py-2.5 text-sm border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 text-[var(--color-error)]">
                {msg.message}
              </div>
            </div>
          );
        }
        return null;
      })}

      {/* Tool call blocks (current round) */}
      {toolCalls.length > 0 && (
        <div className="flex flex-col gap-1 ml-10">
          {toolCalls.map((tc) => (
            <ToolCallBlock key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {/* Ask user question modal */}
      {pendingQuestion && (
        <AskUserQuestionModal
          questions={pendingQuestion.questions}
          onAnswer={onAnswerQuestion}
        />
      )}

      {/* Plan approval modal */}
      {pendingPlan && (
        <PlanApprovalModal
          plan={pendingPlan.plan}
          isEnterMode={pendingPlan.isEnterMode}
          onApprove={() => onRespondPlan('approved')}
          onReject={() => onRespondPlan('rejected')}
        />
      )}

      {/* ThinkingBlock — always visible while assistant is active, click to expand/collapse content */}
      {(isThinking || chatState === 'streaming') && (
        <ThinkingBlock content={thinkingText} isActive={isThinking || chatState === 'streaming'} />
      )}

      {/* Thinking indicator when tools are running but no streaming text */}
      {hasRunningTool && !streamingText && !thinkingText && <StreamingIndicator />}

      {/* Streaming text */}
      {streamingText && (
        <AssistantMessage content={streamingText} createdAt="" streaming />
      )}

      <div ref={endRef} />
    </div>
  );
}
