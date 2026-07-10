/**
 * PlanApprovalModal — 计划审批对话框
 *
 * 参照 smart-code ExitPlanModeTool 的前端交互，简化版。
 * 当 LLM 调用 EnterPlanMode/ExitPlanMode 时，显示计划供用户审批。
 */

import { useTranslation } from '../../i18n';
import { MarkdownRenderer } from '../markdown/MarkdownRenderer';

type Props = {
  plan: string;
  isEnterMode?: boolean;
  onApprove: () => void;
  onReject: () => void;
};

export function PlanApprovalModal({ plan, isEnterMode = false, onApprove, onReject }: Props) {
  const t = useTranslation();

  return (
    <div className="flex justify-start mb-2">
      <div className="max-w-[85%] rounded-xl border border-[var(--color-brand)]/30 bg-[var(--color-surface-container-low)] px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-brand)]">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <span className="text-xs font-semibold text-[var(--color-brand)] uppercase tracking-wider">
            {isEnterMode ? t('tool.planModeEnter') : t('tool.planProposal')}
          </span>
        </div>

        {!isEnterMode && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 mb-3 max-h-64 overflow-y-auto">
            <MarkdownRenderer content={plan} />
          </div>
        )}

        {isEnterMode && (
          <p className="text-sm text-[var(--color-text-secondary)] mb-3">
            {t('tool.planModeEnterDesc')}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onReject}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            {t('tool.reject')}
          </button>
          <button
            onClick={onApprove}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg text-[var(--color-btn-primary-fg)] transition-all hover:brightness-105"
            style={{ background: 'var(--gradient-btn-primary)' }}
          >
            {t('tool.approve')}
          </button>
        </div>
      </div>
    </div>
  );
}
