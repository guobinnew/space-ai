/**
 * MessageList — 消息列表组件
 *
 * 参照 smart-code chat/MessageList.tsx 的设计思路。
 * 使用 buildRenderModel 将扁平消息列表转换为渲染模型，
 * 工具调用与思考块按正确时序交错排列。
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

type RenderItem =
  | { kind: 'message'; msg: UIMessage }
  | { kind: 'tool_use'; msg: UIMessage & { type: 'tool_use' }; result: (UIMessage & { type: 'tool_result' }) | null; isRunning: boolean }

/**
 * 将扁平消息数组转换为渲染模型：
 * - tool_result 跳过（内联到对应的 tool_use 展示）
 * - tool_use 使用 render model 渲染
 * - 其他消息保持原始顺序
 */
function buildRenderModel(messages: UIMessage[], toolCalls: ToolCallInfo[]): RenderItem[] {
  const items: RenderItem[] = []

  // Build result map: toolCallId → tool_result
  const resultMap = new Map<string, UIMessage & { type: 'tool_result' }>()
  for (const msg of messages) {
    if (msg.type === 'tool_result') {
      resultMap.set(msg.toolCallId, msg)
    }
  }

  // Build running set
  const runningIds = new Set(toolCalls.filter((tc) => tc.status === 'running').map((tc) => tc.id))

  for (const msg of messages) {
    if (msg.type === 'tool_result') continue // rendered inline

    if (msg.type === 'tool_use') {
      const result = resultMap.get(msg.toolCallId) || null
      items.push({ kind: 'tool_use', msg, result, isRunning: runningIds.has(msg.toolCallId) })
      continue
    }

    items.push({ kind: 'message', msg })
  }

  return items
}

// 注入一次全局样式（content-visibility 优化）
if (typeof document !== 'undefined' && !document.querySelector('#ml-scroll-styles')) {
  const style = document.createElement('style');
  style.id = 'ml-scroll-styles';
  style.textContent = `
    .msg-item { content-visibility: auto; contain-intrinsic-size: 80px; }
    .msg-list-container { overscroll-behavior: contain; scroll-behavior: smooth; contain: layout style paint; }
  `;
  document.head.appendChild(style);
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
  const scrollRAF = useRef<number | null>(null);

  // Build render model from messages (preserves chronological order)
  const renderItems = useMemo(
    () => buildRenderModel(messages, toolCalls),
    [messages, toolCalls],
  );

  const prevMsgCountRef = useRef(messages.length);

  useEffect(() => {
    const el = endRef.current;
    if (!el) return;
    const scrollParent = el.parentElement?.parentElement;
    if (!scrollParent) return;

    // Cancel any pending RAF
    if (scrollRAF.current !== null) {
      cancelAnimationFrame(scrollRAF.current);
    }

    if (!initialScrollDone.current) {
      if (messages.length > 0) {
        initialScrollDone.current = true;
        scrollRAF.current = requestAnimationFrame(() => {
          scrollParent.scrollTo({ top: scrollParent.scrollHeight, behavior: 'instant' });
          scrollRAF.current = null;
        });
      }
      return;
    }

    // New message -> smooth scroll to bottom
    if (messages.length > prevMsgCountRef.current) {
      prevMsgCountRef.current = messages.length;
      scrollRAF.current = requestAnimationFrame(() => {
        scrollParent.scrollTo({ top: scrollParent.scrollHeight, behavior: 'smooth' });
        scrollRAF.current = null;
      });
      return;
    }
    prevMsgCountRef.current = messages.length;

    // Stream update: keep at bottom if user is near bottom
    const distanceFromBottom =
      scrollParent.scrollHeight - scrollParent.scrollTop - scrollParent.clientHeight;
    if (distanceFromBottom < 100) {
      scrollRAF.current = requestAnimationFrame(() => {
        scrollParent.scrollTo({ top: scrollParent.scrollHeight, behavior: 'instant' });
        scrollRAF.current = null;
      });
    }

    return () => {
      if (scrollRAF.current !== null) {
        cancelAnimationFrame(scrollRAF.current);
      }
    };
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
    <div className="max-w-3xl mx-auto flex flex-col py-4">
      {/* Render items in chronological order */}
      {renderItems.map((item) => {
        if (item.kind === 'tool_use') {
          const { msg, result, isRunning } = item;
          const info: ToolCallInfo = {
            id: msg.toolCallId,
            toolName: msg.toolName,
            input: msg.input,
            result: result?.result,
            isError: result?.isError,
            status: isRunning ? 'running' : result ? (result.isError ? 'error' : 'completed') : 'running',
          };
          return (
            <div key={msg.id} className="msg-item">
              <ToolCallBlock toolCall={info} />
            </div>
          );
        }

        const msg = item.msg;
        if (msg.type === 'user_text') {
          return (
            <div key={msg.id} className="msg-item">
              <UserMessage content={msg.content} createdAt={msg.createdAt} />
            </div>
          );
        }
        if (msg.type === 'assistant_text') {
          return (
            <div key={msg.id} className="msg-item">
              <AssistantMessage content={msg.content} createdAt={msg.createdAt} />
            </div>
          );
        }
        if (msg.type === 'thinking') {
          return (
            <div key={msg.id} className="msg-item">
              <ThinkingBlock content={msg.content} isActive={false} />
            </div>
          );
        }
        if (msg.type === 'error') {
          return (
            <div key={msg.id} className="msg-item">
              <div className="flex justify-start ml-10">
                <div className="max-w-[80%] rounded-xl px-4 py-2.5 text-sm border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 text-[var(--color-error)]">
                  {msg.message}
                </div>
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

      {/* Current round: active thinking + streaming text */}
      {(streamingText || thinkingText) && (
        <>
          {thinkingText && (
            <ThinkingBlock content={thinkingText} isActive={chatState !== 'idle'} />
          )}
          {streamingText && (
            <AssistantMessage content={streamingText} createdAt="" streaming />
          )}
        </>
      )}

      {/* Streaming indicator when running tools with no other output */}
      {hasRunningTool && !streamingText && !thinkingText && chatState === 'idle' && <StreamingIndicator />}

      <div ref={endRef} />
    </div>
  );
}
