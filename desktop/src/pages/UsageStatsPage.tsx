import { useChatStore } from '../stores/chatStore';

/**
 * 用量统计页面 —— 显示所有会话的累计 token 消耗。
 * 点击侧边栏「用量统计」打开此页。
 *
 * 注意：`totalUsage` 在客户端内存累积，不持久化到服务端。
 * 数据来源为已加载到 chatStore 的会话（用户实际发送过消息的会话）。
 */
export function UsageStatsPage() {
  const sessions = useChatStore().sessions;

  // 聚合并所有会话的用量
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheCreation = 0;
  let sessionCount = 0;

  for (const key of Object.keys(sessions)) {
    const s = sessions[key];
    if (s.totalUsage && (s.totalUsage.totalInput > 0 || s.totalUsage.totalOutput > 0)) {
      totalInput += s.totalUsage.totalInput;
      totalOutput += s.totalUsage.totalOutput;
      totalCacheRead += s.totalUsage.totalCacheRead;
      totalCacheCreation += s.totalUsage.totalCacheCreation;
      sessionCount++;
    }
  }

  const hasData = sessionCount > 0 || totalInput > 0;
  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6">
      <h1 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">用量统计</h1>
      <p className="text-xs text-[var(--color-text-tertiary)] mb-6">
        统计范围：{sessionCount} 个会话 · 数据实时更新（仅内存，刷新页面后重置）
      </p>

      {!hasData ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3 text-[var(--color-text-tertiary)]">{'\uD83D\uDCCA'}</div>
            <p className="text-sm text-[var(--color-text-secondary)] mb-2">暂无用量数据</p>
            <p className="text-xs text-[var(--color-text-tertiary)] max-w-sm mx-auto leading-relaxed">
              发送消息后，token 用量将在每轮对话结束时累积。
              <br />
              数据仅保存在当前会话内存中，刷新页面后归零。
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="输入 Token" value={fmt(totalInput)} color="var(--color-brand)" />
            <StatCard label="输出 Token" value={fmt(totalOutput)} color="var(--color-success)" />
            <StatCard label="缓存读取" value={fmt(totalCacheRead)} color="var(--color-accent)" />
            <StatCard label="缓存创建" value={fmt(totalCacheCreation)} color="var(--color-warning)" />
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">总量合计</h2>
            <div className="space-y-2">
              <SummaryRow label="总输入" value={fmt(totalInput)} />
              <SummaryRow label="总输出" value={fmt(totalOutput)} />
              <SummaryRow label="缓存读" value={fmt(totalCacheRead)} />
              <SummaryRow label="缓存创" value={fmt(totalCacheCreation)} />
              <div className="border-t border-[var(--color-border)] pt-2 mt-2">
                <SummaryRow label="总计（输入+输出）" value={fmt(totalInput + totalOutput)} bold />
              </div>
              {totalInput + totalOutput > 0 && (
                <SummaryRow
                  label="缓存命中率"
                  value={`${Math.round((totalCacheRead / (totalInput + totalCacheRead)) * 100)}%`}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-[11px] text-[var(--color-text-tertiary)] mb-1">{label}</div>
      <div className="text-2xl font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-[var(--color-text-secondary)]">{label}</span>
      <span className={`tabular-nums ${bold ? 'font-semibold text-[var(--color-text-primary)]' : 'text-[var(--color-text-primary)]'}`}>{value}</span>
    </div>
  );
}
