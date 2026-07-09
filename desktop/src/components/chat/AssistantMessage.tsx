/**
 * AssistantMessage — 助手消息气泡
 *
 * 参照 smart-code chat/AssistantMessage.tsx。
 * 带动画头像 + MarkdownRenderer 渲染。
 */

import { MarkdownRenderer } from '../markdown/MarkdownRenderer';

/** Animated robot face with blinking eyes */
function AgentAvatar() {
  return (
    <svg
      viewBox="0 0 36 36"
      className="h-full w-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background circle */}
      <circle cx="18" cy="18" r="17" fill="currentColor" opacity="0.12" />
      {/* Robot head outline */}
      <rect
        x="8"
        y="10"
        width="20"
        height="16"
        rx="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Antenna */}
      <line x1="18" y1="10" x2="18" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="18" cy="5" r="1.5" fill="currentColor" />
      {/* Eyes - blinking animation */}
      <g className="animate-blink origin-center">
        {/* Left eye */}
        <rect x="11" y="15" width="5" height="5" rx="1.5" fill="currentColor" />
        {/* Right eye */}
        <rect x="20" y="15" width="5" height="5" rx="1.5" fill="currentColor" />
      </g>
      {/* Mouth - smile curve */}
      <path
        d="M13 24 Q18 27 23 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AssistantMessage({
  content,
  createdAt,
  streaming,
}: {
  content: string;
  createdAt: string;
  streaming?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 mb-3">
      {/* Agent avatar */}
      <div className="shrink-0 pt-0.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-brand)]/15 text-[var(--color-brand)]">
          <AgentAvatar />
        </div>
      </div>

      {/* Message bubble */}
      <div className="min-w-0 max-w-[85%]">
        <div className="rounded-[20px] rounded-tl-[8px] px-4 py-2.5 text-sm bg-[var(--color-surface-container-low)] border border-[var(--color-border)]/60 text-[var(--color-text-primary)] shadow-sm break-words">
          <MarkdownRenderer content={content} />
          {streaming && (
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-[var(--color-brand)] animate-pulse align-middle" />
          )}
        </div>
        {createdAt && !streaming && (
          <div className="text-[10px] text-[var(--color-text-tertiary)] mt-1 ml-1">
            {new Date(createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}
