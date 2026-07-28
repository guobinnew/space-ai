/**
 * SkillsSettings — 技能设置
 *
 * 参照 smart-code SkillSettings 复刻，简化版。
 * 列出已安装技能，支持导入技能包。
 */

import { useState, useEffect } from 'react';
import { skillsApi, type SkillMeta } from '../../api/features';
import { useTranslation } from '../../i18n';

export function SkillsSettings() {
  const t = useTranslation();
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchSkills = async () => {
    setIsLoading(true);
    try {
      const data = await skillsApi.list();
      setSkills(data.skills);
    } catch {
      setSkills([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchSkills();
  }, []);

  const handleImport = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Zip', extensions: ['zip'] }],
        title: t('settings.skills.import'),
      });
      if (typeof selected !== 'string') return;

      setImporting(true);
      const result = await skillsApi.import(selected);
      setMessage({ type: 'success', text: result.message || t('settings.skills.importSuccess') });
      await fetchSkills();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('settings.skills.importFailed') });
    } finally {
      setImporting(false);
    }
  };

  const sourceLabels: Record<SkillMeta['source'], string> = {
    builtin: t('settings.skills.sourceBuiltin'),
    user: t('settings.skills.sourceUser'),
    project: t('settings.skills.sourceProject'),
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{t('settings.skills.title')}</h2>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">{t('settings.skills.desc')}</p>
        </div>
        <button
          onClick={handleImport}
          disabled={importing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-[var(--color-btn-primary-fg)] transition-all hover:brightness-105 disabled:opacity-50"
          style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {importing ? t('settings.skills.importing') : t('settings.skills.import')}
        </button>
      </div>

      {message && (
        <div className={`mb-4 rounded-lg border px-3 py-2 text-xs ${
          message.type === 'success'
            ? 'border-[var(--color-success)]/20 bg-[var(--color-success)]/5 text-[var(--color-success)]'
            : 'border-[var(--color-error)]/20 bg-[var(--color-error)]/5 text-[var(--color-error)]'
        }`}>
          {message.text}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-5 h-5 border-2 border-[var(--color-brand)] border-t-transparent rounded-full" />
        </div>
      ) : skills.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">{t('settings.skills.empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {skills.map((skill) => (
            <div
              key={skill.name}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-container-high)] text-[var(--color-brand)] flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z" />
                </svg>
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">{skill.name}</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--color-surface-container-high)] text-[var(--color-text-tertiary)] leading-none">
                    {sourceLabels[skill.source]}
                  </span>
                </div>
                <div className="text-xs text-[var(--color-text-tertiary)] truncate mt-0.5">{skill.description}</div>
              </div>
              {skill.tokenEstimate && (
                <span className="text-[10px] text-[var(--color-text-tertiary)] flex-shrink-0">{t('skills.tokenEstimate', { n: skill.tokenEstimate })}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
