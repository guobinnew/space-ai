/**
 * SkillsSettings — 技能设置
 *
 * 参照 smart-code SkillSettings 复刻。
 * - 顶部统计卡片（总数、来源数、Token）
 * - 技能列表（可点击查看详情）
 * - 技能详情页（返回按钮 + 元信息 + 内容）
 */

import { useState, useEffect, useMemo } from 'react';
import { skillsApi, type SkillMeta } from '../../api/features';
import { useTranslation } from '../../i18n';

type SkillDetail = SkillMeta & { content: string };

export function SkillsSettings() {
  const t = useTranslation();
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

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

  const handleSkillClick = async (skill: SkillMeta) => {
    setIsDetailLoading(true);
    try {
      const data = await skillsApi.get(skill.name);
      setSelectedSkill(data.skill);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load skill detail' });
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedSkill(null);
  };

  // Statistics
  const stats = useMemo(() => {
    const sources = new Set(skills.map(s => s.source));
    const totalTokens = skills.reduce((sum, s) => sum + (s.tokenEstimate || 0), 0);
    return {
      total: skills.length,
      sources: sources.size,
      tokens: totalTokens,
    };
  }, [skills]);

  const sourceLabels: Record<SkillMeta['source'], string> = {
    builtin: t('settings.skills.sourceBuiltin'),
    user: t('settings.skills.sourceUser'),
    project: t('settings.skills.sourceProject'),
  };

  // Detail view
  if (selectedSkill) {
    return (
      <div className="w-full">
        {/* Back button */}
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] mb-4 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('settings.skills.back')}
        </button>

        {/* Header */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-5 mb-4">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-brand)]/10 text-[var(--color-brand)] flex-shrink-0">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{selectedSkill.name}</h2>
                <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[var(--color-surface-container-high)] text-[var(--color-text-tertiary)] leading-none">
                  {sourceLabels[selectedSkill.source]}
                </span>
              </div>
              <p className="text-sm text-[var(--color-text-secondary)]">{selectedSkill.description}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
            <div className="flex items-center gap-2 mb-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-brand)]">
                <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z" />
              </svg>
              <span className="text-[11px] text-[var(--color-text-tertiary)] uppercase tracking-wider">{t('settings.skills.tokens')}</span>
            </div>
            <div className="text-lg font-bold text-[var(--color-text-primary)]">
              ~{selectedSkill.tokenEstimate?.toLocaleString() || '—'}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
            <div className="flex items-center gap-2 mb-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-success)]">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span className="text-[11px] text-[var(--color-text-tertiary)] uppercase tracking-wider">{t('settings.skills.source')}</span>
            </div>
            <div className="text-lg font-bold text-[var(--color-text-primary)]">
              {sourceLabels[selectedSkill.source]}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
            <div className="flex items-center gap-2 mb-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-warning)]">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-[11px] text-[var(--color-text-tertiary)] uppercase tracking-wider">{t('settings.skills.invocable')}</span>
            </div>
            <div className="text-lg font-bold text-[var(--color-text-primary)]">
              {selectedSkill.userInvocable ? t('settings.skills.yes') : t('settings.skills.no')}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-container)]">
            <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{t('settings.skills.content')}</h3>
          </div>
          <div className="p-4 max-h-[500px] overflow-y-auto">
            {selectedSkill.content ? (
              <pre className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap font-mono leading-relaxed">
                {selectedSkill.content}
              </pre>
            ) : (
              <p className="text-sm text-[var(--color-text-tertiary)] italic">No content available</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // List view
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

      {/* Statistics */}
      {!isLoading && skills.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
            <div className="text-[11px] text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">
              {t('settings.skills.totalSkills')}
            </div>
            <div className="text-lg font-bold text-[var(--color-text-primary)]">{stats.total}</div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
            <div className="text-[11px] text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">
              {t('settings.skills.totalSources')}
            </div>
            <div className="text-lg font-bold text-[var(--color-text-primary)]">{stats.sources}</div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
            <div className="text-[11px] text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">
              {t('settings.skills.totalTokens')}
            </div>
            <div className="text-lg font-bold text-[var(--color-text-primary)]">~{stats.tokens.toLocaleString()}</div>
          </div>
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
            <button
              key={skill.name}
              onClick={() => handleSkillClick(skill)}
              disabled={isDetailLoading}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] hover:border-[var(--color-brand)]/40 hover:bg-[var(--color-surface-container)] transition-all text-left w-full disabled:opacity-50"
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
              <div className="flex items-center gap-2 flex-shrink-0">
                {skill.tokenEstimate && (
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">{t('skills.tokenEstimate', { n: skill.tokenEstimate })}</span>
                )}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-tertiary)]">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
