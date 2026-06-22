/**
 * UserMessage — 用户消息气泡
 *
 * 参照 smart-code chat/UserMessage.tsx 复刻。
 */

export function UserMessage({ content, createdAt }: { content: string; createdAt: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-xl px-4 py-2.5 text-sm bg-[var(--color-surface-container-high)] text-[var(--color-text-primary)]">
        <div className="whitespace-pre-wrap break-words">{content}</div>
        {createdAt && (
          <div className="text-[10px] text-[var(--color-text-tertiary)] mt-1 text-right">
            {new Date(createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}
