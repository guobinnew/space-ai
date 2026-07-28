import { useState, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { providersApi } from '../../api/providers';
import { PROVIDER_PRESETS } from '../../config/providerPresets';
import type { SavedProvider, ProviderTestResult, ProviderPreset, ApiFormat, ModelMapping, ModelCapabilities } from '../../types/provider';

export function ProviderSettings() {
  const t = useTranslation();
  const [providers, setProviders] = useState<SavedProvider[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingProvider, setEditingProvider] = useState<SavedProvider | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { loading: boolean; result?: ProviderTestResult }>>({});
const [ttsTestResults, setTtsTestResults] = useState<Record<string, { loading: boolean; success?: boolean; latencyMs?: number; error?: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await providersApi.list();
      setProviders(data.providers);
      setActiveId(data.activeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.providers.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchProviders();
  }, []);

  const handleDelete = async (provider: SavedProvider) => {
    if (activeId === provider.id) return;
    if (!window.confirm(`${t('settings.providers.confirmDelete')}「${provider.name}」？`)) return;
    try {
      await providersApi.delete(provider.id);
      await fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.providers.deleteFailed'));
    }
  };

  const handleTest = async (provider: SavedProvider) => {
    setTestResults((r) => ({ ...r, [provider.id]: { loading: true } }));
    try {
      const { result } = await providersApi.test(provider.id);
      setTestResults((r) => ({ ...r, [provider.id]: { loading: false, result } }));
    } catch {
      setTestResults((r) => ({
        ...r,
        [provider.id]: {
          loading: false,
          result: { connectivity: { success: false, latencyMs: 0, error: '请求失败' } },
        },
      }));
    }
  };

  const handleTtsTest = async (provider: SavedProvider) => {
    setTtsTestResults((r) => ({ ...r, [provider.id]: { loading: true } }));
    try {
      const { ok, blob, latencyMs, error } = await providersApi.testTts(provider.id);
      if (ok && blob) {
        // 播放音频
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play().catch(() => {});
        setTtsTestResults((r) => ({ ...r, [provider.id]: { loading: false, success: true, latencyMs } }));
      } else {
        setTtsTestResults((r) => ({ ...r, [provider.id]: { loading: false, success: false, error: error || '未知错误' } }));
      }
    } catch {
      setTtsTestResults((r) => ({
        ...r,
        [provider.id]: { loading: false, success: false, error: '请求失败' },
      }));
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await providersApi.activate(id);
      await fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.providers.activateFailed'));
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{t('settings.providers.title')}</h2>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">{t('settings.providers.desc')}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-[var(--color-btn-primary-fg)] transition-all hover:brightness-105"
          style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('settings.providers.add')}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[var(--color-error)]/20 bg-[var(--color-error)]/5 px-3 py-2 text-xs text-[var(--color-error)]">
          {error}
        </div>
      )}

      {isLoading && providers.length === 0 ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-5 h-5 border-2 border-[var(--color-brand)] border-t-transparent rounded-full" />
        </div>
      ) : providers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">{t('settings.providers.empty')}</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-[var(--color-btn-primary-fg)] transition-all hover:brightness-105"
            style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
          >
            {t('settings.providers.addFirst')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {providers.map((provider) => {
            const isActive = activeId === provider.id;
            const test = testResults[provider.id];
            const ttsTest = ttsTestResults[provider.id];
            const preset = PROVIDER_PRESETS.find((p) => p.id === provider.presetId);
            return (
              <div
                key={provider.id}
                className={`relative flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all group ${
                  isActive
                    ? 'border-[var(--color-brand)] bg-[var(--color-surface-container)] shadow-[var(--shadow-focus-ring)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-border-focus)]'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isActive ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-tertiary)]'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{provider.name}</span>
                    {preset && preset.id !== 'custom' && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--color-surface-container-high)] text-[var(--color-text-tertiary)] leading-none">{preset.name}</span>
                    )}
                    {provider.apiFormat && provider.apiFormat !== 'anthropic' && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--color-surface-container-high)] text-[var(--color-warning)] leading-none">
                        OpenAI
                      </span>
                    )}
                    {isActive && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded border border-[var(--color-brand)]/18 bg-[var(--color-brand)]/14 text-[var(--color-brand)] leading-none">{t('settings.providers.active')}</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--color-text-tertiary)] truncate mt-0.5">
                    {provider.baseUrl} · {provider.models.main}
                  </div>
                  {test && !test.loading && test.result && (
                    <div className="text-xs mt-1">
                      <span className={test.result.connectivity.success ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
                        {test.result.connectivity.success
                          ? `${t('settings.providers.connectivityOk')} (${test.result.connectivity.latencyMs}ms)`
                          : `${t('settings.providers.connectivityFailed')}: ${test.result.connectivity.error || ''}`}
                      </span>
                    </div>
                  )}
                  {ttsTest && !ttsTest.loading && ttsTest.success !== undefined && (
                    <div className="text-xs mt-1">
                      <span className={ttsTest.success ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
                        {ttsTest.success
                          ? `TTS ${t('settings.providers.connectivityOk')} (${ttsTest.latencyMs}ms)`
                          : `TTS ${t('settings.providers.connectivityFailed')}: ${ttsTest.error || ''}`}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {!isActive && (
                    <button onClick={() => handleActivate(provider.id)} className="px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded transition-colors">
                      {t('settings.providers.activate')}
                    </button>
                  )}
                  <button
                    onClick={() => handleTest(provider)}
                    disabled={test?.loading}
                    className="px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded transition-colors disabled:opacity-50"
                  >
                    {test?.loading ? t('settings.providers.testing') : t('settings.providers.test')}
                  </button>
                  <button
                    onClick={() => handleTtsTest(provider)}
                    disabled={ttsTest?.loading || !provider.models.tts}
                    className="px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded transition-colors disabled:opacity-50"
                  >
                    {ttsTest?.loading ? t('settings.providers.testing') : 'TTS'}
                  </button>
                  <button onClick={() => setEditingProvider(provider)} className="px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded transition-colors">
                    {t('settings.providers.edit')}
                  </button>
                  {!isActive && (
                    <button onClick={() => handleDelete(provider)} className="px-2.5 py-1 text-xs text-[var(--color-error)] hover:bg-[var(--color-surface-hover)] rounded transition-colors">
                      {t('settings.providers.delete')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <ProviderFormModal
          onClose={() => setShowCreateModal(false)}
          onSaved={fetchProviders}
          mode="create"
        />
      )}
      {editingProvider && (
        <ProviderFormModal
          key={editingProvider.id}
          onClose={() => setEditingProvider(null)}
          onSaved={fetchProviders}
          mode="edit"
          provider={editingProvider}
        />
      )}
    </div>
  );
}

type ProviderFormModalProps = {
  onClose: () => void;
  onSaved: () => void;
  mode: 'create' | 'edit';
  provider?: SavedProvider;
};

function ProviderFormModal({ onClose, onSaved, mode, provider }: ProviderFormModalProps) {
  const t = useTranslation();
  const availablePresets = PROVIDER_PRESETS;
  const fallbackPreset = availablePresets[availablePresets.length - 1] ?? availablePresets[0]!;
  const initialPreset = provider
    ? availablePresets.find((p) => p.id === provider.presetId) ?? fallbackPreset
    : availablePresets[0] ?? fallbackPreset;

  const [selectedPreset, setSelectedPreset] = useState<ProviderPreset>(initialPreset);
  const [name, setName] = useState(provider?.name ?? initialPreset.name);
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? initialPreset.baseUrl);
  const [apiFormat, setApiFormat] = useState<ApiFormat>(provider?.apiFormat ?? initialPreset.apiFormat ?? 'anthropic');
  const [apiKey, setApiKey] = useState('');
  const [notes, setNotes] = useState(provider?.notes ?? '');
  const [models, setModels] = useState<ModelMapping>(provider?.models ?? { ...initialPreset.defaultModels });
  const [ttsBaseUrl, setTtsBaseUrl] = useState(provider?.ttsBaseUrl ?? '');
  const [ttsVoice, setTtsVoice] = useState(provider?.ttsVoice ?? '');
  const [capabilities, setCapabilities] = useState<ModelCapabilities>(provider?.capabilities ?? { ...initialPreset.defaultCapabilities });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePresetChange = (preset: ProviderPreset) => {
    setSelectedPreset(preset);
    setName(preset.name);
    setBaseUrl(preset.baseUrl);
    setApiFormat(preset.apiFormat ?? 'anthropic');
    setModels({ ...preset.defaultModels });
    setTtsBaseUrl('');
    setTtsVoice('');
    setCapabilities({ ...preset.defaultCapabilities });
  };

  const canSubmit = name.trim() && baseUrl.trim() && (mode === 'edit' || apiKey.trim()) && models.main.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
      const normalizedModels: ModelMapping = {
      main: models.main,
      tts: models.tts?.trim() || undefined,
    };
    const ttsBaseUrlTrimmed = ttsBaseUrl.trim() || undefined;
    const ttsVoiceTrimmed = ttsVoice.trim() || undefined;
    try {
      if (mode === 'create') {
        await providersApi.create({
          presetId: selectedPreset.id,
          name: name.trim(),
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim(),
          ttsBaseUrl: ttsBaseUrlTrimmed,
          ttsVoice: ttsVoiceTrimmed,
          apiFormat,
          models: normalizedModels,
          capabilities,
          notes: notes.trim() || undefined,
        });
      } else if (provider) {
        const input: import('../../types/provider').UpdateProviderInput = {
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          ttsBaseUrl: ttsBaseUrlTrimmed,
          ttsVoice: ttsVoiceTrimmed,
          apiFormat,
          models: normalizedModels,
          capabilities,
          notes: notes.trim() || undefined,
        };
        if (apiKey.trim()) input.apiKey = apiKey.trim();
        await providersApi.update(provider.id, input);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('provider.form.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] w-full max-w-lg max-h-[85vh] flex flex-col mx-4"
        style={{ boxShadow: 'var(--shadow-dropdown)' }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {mode === 'create' ? t('provider.form.add') : t('provider.form.edit')}
          </h3>
          <button onClick={onClose} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="rounded-lg border border-[var(--color-error)]/20 bg-[var(--color-error)]/5 px-3 py-2 text-xs text-[var(--color-error)]">
              {error}
            </div>
          )}

          {/* Preset selector */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">{t('provider.form.preset')}</label>
            <select
              value={selectedPreset.id}
              onChange={(e) => {
                const preset = availablePresets.find((p) => p.id === e.target.value);
                if (preset) handlePresetChange(preset);
              }}
              className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
            >
              {availablePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">{t('provider.form.name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
              placeholder={t('provider.form.namePlaceholder')}
            />
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">{t('provider.form.baseUrl')}</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
              placeholder="https://api.example.com"
            />
          </div>

          {/* API Format */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">{t('provider.form.apiFormat')}</label>
            <select
              value={apiFormat}
              onChange={(e) => setApiFormat(e.target.value as ApiFormat)}
              className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              {t('provider.form.apiKey')} {mode === 'edit' && <span className="text-[var(--color-text-tertiary)]">{t('provider.form.apiKeyEditHint')}</span>}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
              placeholder={mode === 'edit' ? t('provider.form.apiKeyMasked') : t('provider.form.apiKeyPlaceholder')}
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">{t('provider.form.model')}</label>
            <input
              type="text"
              value={models.main}
              onChange={(e) => setModels({ ...models, main: e.target.value })}
              className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
              placeholder={t('provider.form.modelPlaceholder')}
            />
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">{t('provider.form.modelHint')}</p>
          </div>

          {/* TTS Model */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">{t('provider.form.ttsModel')}</label>
            <input
              type="text"
              value={models.tts ?? ''}
              onChange={(e) => setModels({ ...models, tts: e.target.value })}
              className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
              placeholder={t('provider.form.ttsModelPlaceholder')}
            />
          </div>

          {/* TTS Base URL */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">{t('provider.form.ttsBaseUrl')}</label>
            <input
              type="text"
              value={ttsBaseUrl}
              onChange={(e) => setTtsBaseUrl(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
              placeholder={t('provider.form.ttsBaseUrlPlaceholder')}
            />
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">{t('provider.form.ttsBaseUrlHint')}</p>
          </div>

          {/* TTS Voice */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">{t('provider.form.ttsVoice')}</label>
            <input
              type="text"
              value={ttsVoice}
              onChange={(e) => setTtsVoice(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
              placeholder={t('provider.form.ttsVoicePlaceholder')}
            />
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">{t('provider.form.ttsVoiceHint')}</p>
          </div>

          {/* Image input capability */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="image-input"
              checked={capabilities.imageInput ?? false}
              onChange={(e) => setCapabilities({ ...capabilities, imageInput: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="image-input" className="text-sm text-[var(--color-text-secondary)]">{t('provider.form.imageInput')}</label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">{t('provider.form.notes')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)] resize-none"
              placeholder={t('provider.form.notesPlaceholder')}
            />
          </div>
        </div>

        {/* Modal footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border)] flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors"
          >
            {t('provider.form.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="px-4 py-2 text-sm font-semibold text-[var(--color-btn-primary-fg)] rounded-lg transition-all hover:brightness-105 disabled:opacity-30"
            style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
          >
            {isSubmitting ? t('provider.form.saving') : mode === 'create' ? t('provider.form.addBtn') : t('provider.form.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
