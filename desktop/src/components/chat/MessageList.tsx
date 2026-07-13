/**
 * MessageList — 消息列表组件
 *
 * 参照 smart-code chat/MessageList.tsx 的设计思路。
 * 使用 buildRenderModel 将扁平消息列表转换为渲染模型，
 * 工具调用消息存储在 messages 数组中，保持正确的时间顺序。
 */

import { useEffect, useRef, useMemo } from 'react';
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

type RenderItem = { kind: 'message'; msg: UIMessage }

/**
 * 将扁平消息数组转换为渲染模型：
 * - tool_use/tool_result 跳过（由底部 toolCalls 统一渲染）
 * - 其他消息保持原始顺序
 */
function buildRenderModel(messages: UIMessage[]): RenderItem[] {
  return messages
    .filter((msg) => msg.type !== 'tool_use' && msg.type !== 'tool_result')
    .map((msg) => ({ kind: 'message' as const, msg }))
}

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
  const initialScrollDone = useRef(false);

  // Build render model from messages (tool_use/tool_result filtered out, rendered via toolCalls)
  const renderItems = useMemo(
    () => buildRenderModel(messages),
    [messages],
  );

  // Track previous message count to detect new messages
  const prevMsgCountRef = useRef(messages.length);

  useEffect(() => {
    const el = endRef.current;
    if (!el) return;
    // Find the scrollable container (parent of this MessageList wrapper)
    // DOM: div.flex-1.overflow-y-auto > div.max-w-3xl > div(ref)
    const scrollParent = el.parentElement?.parentElement;
    if (!scrollParent) return;

    // Always scroll to bottom on first load (user opened the session).
    if (!initialScrollDone.current) {
      if (messages.length > 0) {
        initialScrollDone.current = true;
        requestAnimationFrame(() => {
          scrollParent.scrollTop = scrollParent.scrollHeight;
        });
      }
      return;
    }

    // New message added → always scroll to bottom
    if (messages.length > prevMsgCountRef.current) {
      prevMsgCountRef.current = messages.length;
      scrollParent.scrollTop = scrollParent.scrollHeight;
      return;
    }
    prevMsgCountRef.current = messages.length;

    // For streaming/thinking/tool-call updates, only auto-scroll if user is near bottom
    const distanceFromBottom =
      scrollParent.scrollHeight - scrollParent.scrollTop - scrollParent.clientHeight;
    if (distanceFromBottom < 100) {
      scrollParent.scrollTop = scrollParent.scrollHeight;
    }
  }, [messages.length, streamingText, thinkingText, toolCalls.length]);

  if (messages.length === 0 && !streamingText && chatState === 'idle' && toolCalls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div
          className="h-16 w-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mb-4"
          style={{ background: 'var(--gradient-btn-primary)' }}
        >S</div>
        <p className="text-sm text-[var(--color-text-tertiary)]">{t('chat.empty')}</p>
      </div>
    );
  }

  const hasRunningTool = toolCalls.some((tc) => tc.status === 'running');

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-3 py-4">
      {/* Render items in chronological order */}
      {renderItems.map((item) => {
        const msg = item.msg;
        if (msg.type === 'user_text') {
          return <UserMessage key={msg.id} content={msg.content} createdAt={msg.createdAt} />;
        }
        if (msg.type === 'assistant_text') {
          return <AssistantMessage key={msg.id} content={msg.content} createdAt={msg.createdAt} />;
        }
        if (msg.type === 'thinking') {
          return (
            <div key={msg.id} className="mb-2 ml-10">
              <ThinkingBlock content={msg.content} isActive={false} />
            </div>
          );
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

      {/* Current round: active thinking + tool calls + streaming text */}
      {(streamingText || thinkingText || toolCalls.length > 0) && (
        <>
          {/* Active thinking block (currently streaming) */}
          {thinkingText && (
            <ThinkingBlock content={thinkingText} isActive={chatState !== 'idle'} />
          )}

          {/* Tool calls (live + completed, persistent across rounds) */}
          {toolCalls.length > 0 && (
            <div className="flex flex-col gap-1 ml-10">
              {toolCalls.map((tc) => (
                <ToolCallBlock key={tc.id} toolCall={tc} />
              ))}
            </div>
          )}

          {/* Streaming text */}
          {streamingText && (
            <AssistantMessage content={streamingText} createdAt="" streaming />
          )}
        </>
      )}

      {/* Thinking indicator when something is happening but no visible output yet */}
      {hasRunningTool && !streamingText && !thinkingText && chatState === 'idle' && <StreamingIndicator />}

      <div ref={endRef} />
    </div>
  );
}
