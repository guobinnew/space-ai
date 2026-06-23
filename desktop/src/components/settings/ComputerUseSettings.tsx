/**
 * ComputerUseSettings — 计算机操作设置
 *
 * 参照 smart-code ComputerUseSettings 复刻，简化版。
 * 检查计算机操作可用性，运行设置。
 */

import { useState, useEffect } from 'react';
import { computerUseApi, type ComputerUseStatus } from '../../api/features';

export function ComputerUseSettings() {
  const [status, setStatus] = useState<ComputerUseStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [setupRunning, setSetupRunning] = useState(false);
  const [setupResult, setSetupResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    void fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const data = await computerUseApi.status();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetup = async () => {
    setSetupRunning(true);
    setSetupResult(null);
    try {
      const result = await computerUseApi.setup();
      setSetupResult({ success: result.success, message: result.message });
      await fetchStatus();
    } catch (err) {
      setSetupResult({ success: false, message: err instanceof Error ? err.message : '设置失败' });
    } finally {
      setSetupRunning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-xl flex justify-center py-8">
        <div className="animate-spin w-5 h-5 border-2 border-[var(--color-brand)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">计算机操作</h2>
      <p className="text-sm text-[var(--color-text-tertiary)] mb-6">允许 AI 控制鼠标和键盘执行计算机操作</p>

      {/* Status card */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <span className={`w-2.5 h-2.5 rounded-full ${status?.available ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-tertiary)]'}`} />
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {status?.available ? '可用' : '不可用'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-[var(--color-text-tertiary)]">平台</span>
            <div className="text-[var(--color-text-secondary)] mt-0.5">{status?.platform || '-'}</div>
          </div>
          <div>
            <span className="text-[var(--color-text-tertiary)]">Python</span>
            <div className={`mt-0.5 ${status?.pythonAvailable ? 'text-[var(--color-success)]' : 'text-[var(--color-text-tertiary)]'}`}>
              {status?.pythonAvailable ? '已安装' : '未安装'}
            </div>
          </div>
          <div>
            <span className="text-[var(--color-text-tertiary)]">设置状态</span>
            <div className={`mt-0.5 ${status?.setupCompleted ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>
              {status?.setupCompleted ? '已完成' : '未完成'}
            </div>
          </div>
        </div>
      </div>

      {/* Setup button */}
      <button
        onClick={handleSetup}
        disabled={setupRunning || !status?.available}
        className="px-4 py-2 text-sm font-semibold rounded-lg text-[var(--color-btn-primary-fg)] transition-all hover:brightness-105 disabled:opacity-30"
        style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
      >
        {setupRunning ? '设置中...' : '运行设置'}
      </button>

      {setupResult && (
        <div className={`mt-4 rounded-lg border px-3 py-2 text-xs ${
          setupResult.success
            ? 'border-[var(--color-success)]/20 bg-[var(--color-success)]/5 text-[var(--color-success)]'
            : 'border-[var(--color-error)]/20 bg-[var(--color-error)]/5 text-[var(--color-error)]'
        }`}>
          {setupResult.message}
        </div>
      )}
    </div>
  );
}
