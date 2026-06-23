/**
 * MemorySettings — 存储/记忆设置
 *
 * 参照 smart-code MemorySettings 复刻，简化版。
 * 管理记忆条目（增删改查），显示统计信息。
 */

import { useState, useEffect } from 'react';
import { memoryApi, type MemoryEntry, type MemoryStats } from '../../api/features';
import { useTranslation } from '../../i18n';

export function MemorySettings() {
  const t = useTranslation();
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('general');

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const data = await memoryApi.list();
      setEntries(data.entries);
      setStats(data.stats);
    } catch {
      setEntries([]);
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  const handleCreate = () => {
    setEditingId(null);
    setFormTitle('');
    setFormContent('');
    setFormCategory('general');
    setShowForm(true);
  };

  const handleEdit = (entry: MemoryEntry) => {
    setEditingId(entry.id);
    setFormTitle(entry.title);
    setFormContent(entry.content);
    setFormCategory(entry.category);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    try {
      if (editingId) {
        await memoryApi.update(editingId, { title: formTitle, content: formContent, category: formCategory });
      } else {
        await memoryApi.create({ title: formTitle, content: formContent, category: formCategory });
      }
      setShowForm(false);
      await fetchAll();
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('settings.memory.deleteConfirm'))) return;
    await memoryApi.delete(id);
    await fetchAll();
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{t('settings.memory.title')}</h2>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">{t('settings.memory.desc')}</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-[var(--color-btn-primary-fg)] transition-all hover:brightness-105"
          style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('settings.memory.new')}
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-3 text-center">
            <div className="text-lg font-bold text-[var(--color-text-primary)]">{stats.totalEntries}</div>
            <div className="text-[11px] text-[var(--color-text-tertiary)]">{t('settings.memory.totalEntries')}</div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-3 text-center">
            <div className="text-lg font-bold text-[var(--color-text-primary)]">{Math.round(stats.totalSize / 1024)}KB</div>
            <div className="text-[11px] text-[var(--color-text-tertiary)]">{t('settings.memory.totalSize')}</div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-3 text-center">
            <div className="text-lg font-bold text-[var(--color-text-primary)]">{stats.categories.length}</div>
            <div className="text-[11px] text-[var(--color-text-tertiary)]">{t('settings.memory.categories')}</div>
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
          <input
            type="text"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            className="w-full h-9 px-3 mb-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
            placeholder={t('settings.memory.titlePlaceholder')}
          />
          <textarea
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 mb-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)] resize-none"
            placeholder={t('settings.memory.contentPlaceholder')}
          />
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              className="flex-1 h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
              placeholder={t('settings.memory.categoryPlaceholder')}
            />
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
            >
              {t('settings.memory.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={!formTitle.trim() || !formContent.trim()}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg text-[var(--color-btn-primary-fg)] transition-all hover:brightness-105 disabled:opacity-30"
              style={{ background: 'var(--gradient-btn-primary)' }}
            >
              {t('settings.memory.save')}
            </button>
          </div>
        </div>
      )}

      {/* Entries list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-5 h-5 border-2 border-[var(--color-brand)] border-t-transparent rounded-full" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">{t('settings.memory.empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="group flex items-start gap-3 px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">{entry.title}</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--color-surface-container-high)] text-[var(--color-text-tertiary)] leading-none">
                    {entry.category}
                  </span>
                </div>
                <div className="text-xs text-[var(--color-text-tertiary)] mt-1 line-clamp-2">{entry.content}</div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={() => handleEdit(entry)}
                  className="px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded transition-colors"
                >
                  {t('settings.memory.edit')}
                </button>
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="px-2 py-1 text-xs text-[var(--color-error)] hover:bg-[var(--color-surface-hover)] rounded transition-colors"
                >
                  {t('settings.memory.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
