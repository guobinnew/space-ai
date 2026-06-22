import { useState, useEffect } from 'react';
import { providersApi } from '../../api/providers';
import { PROVIDER_PRESETS } from '../../config/providerPresets';
import type { SavedProvider, ProviderTestResult, ProviderPreset, ApiFormat, ModelMapping, ModelCapabilities } from '../../types/provider';

export function ProviderSettings() {
  const [providers, setProviders] = useState<SavedProvider[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingProvider, setEditingProvider] = useState<SavedProvider | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { loading: boolean; result?: ProviderTestResult }>>({});
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await providersApi.list();
      setProviders(data.providers);
      setActiveId(data.activeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载服务商失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchProviders();
  }, []);

  const handleDelete = async (provider: SavedProvider) => {
    if (activeId === provider.id) return;
    if (!window.confirm(`确定删除服务商「${provider.name}」吗？`)) return;
    try {
      await providersApi.delete(provider.id);
      await fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
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

  const handleActivate = async (id: string) => {
    try {
      await providersApi.activate(id);
      await fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '激活失败');
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">服务商</h2>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">管理 LLM 服务商配置，支持增删改查和连接测试</p>
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
          添加服务商
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
          <p className="text-sm text-[var(--color-text-tertiary)]">还没有配置服务商</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-[var(--color-btn-primary-fg)] transition-all hover:brightness-105"
            style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
          >
            添加第一个服务商
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {providers.map((provider) => {
            const isActive = activeId === provider.id;
            const test = testResults[provider.id];
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
                        {provider.apiFormat === 'openai_chat' ? 'OpenAI Chat' : 'OpenAI Responses'}
                      </span>
                    )}
                    {isActive && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded border border-[var(--color-brand)]/18 bg-[var(--color-brand)]/14 text-[var(--color-brand)] leading-none">当前</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--color-text-tertiary)] truncate mt-0.5">
                    {provider.baseUrl} · {provider.models.main}
                  </div>
                  {test && !test.loading && test.result && (
                    <div className="text-xs mt-1">
                      <span className={test.result.connectivity.success ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
                        {test.result.connectivity.success
                          ? `连接成功 (${test.result.connectivity.latencyMs}ms)`
                          : `连接失败: ${test.result.connectivity.error || ''}`}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {!isActive && (
                    <button onClick={() => handleActivate(provider.id)} className="px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded transition-colors">
                      启用
                    </button>
                  )}
                  <button
                    onClick={() => handleTest(provider)}
                    disabled={test?.loading}
                    className="px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded transition-colors disabled:opacity-50"
                  >
                    {test?.loading ? '测试中...' : '测试'}
                  </button>
                  <button onClick={() => setEditingProvider(provider)} className="px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded transition-colors">
                    编辑
                  </button>
                  {!isActive && (
                    <button onClick={() => handleDelete(provider)} className="px-2.5 py-1 text-xs text-[var(--color-error)] hover:bg-[var(--color-surface-hover)] rounded transition-colors">
                      删除
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
  const [capabilities, setCapabilities] = useState<ModelCapabilities>(provider?.capabilities ?? { ...initialPreset.defaultCapabilities });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePresetChange = (preset: ProviderPreset) => {
    setSelectedPreset(preset);
    setName(preset.name);
    setBaseUrl(preset.baseUrl);
    setApiFormat(preset.apiFormat ?? 'anthropic');
    setModels({ ...preset.defaultModels });
    setCapabilities({ ...preset.defaultCapabilities });
  };

  const canSubmit = name.trim() && baseUrl.trim() && (mode === 'edit' || apiKey.trim()) && models.main.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    const normalizedModels: ModelMapping = {
      main: models.main,
      haiku: models.main,
      sonnet: models.main,
      opus: models.main,
    };
    try {
      if (mode === 'create') {
        await providersApi.create({
          presetId: selectedPreset.id,
          name: name.trim(),
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim(),
          apiFormat,
          models: normalizedModels,
          capabilities,
          notes: notes.trim() || undefined,
        });
      } else if (provider) {
        const input: import('../../types/provider').UpdateProviderInput = {
          name: name.trim(),
          baseUrl: baseUrl.trim(),
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
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] w-full max-w-lg max-h-[85vh] overflow-y-auto mx-4"
        style={{ boxShadow: 'var(--shadow-dropdown)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {mode === 'create' ? '添加服务商' : '编辑服务商'}
          </h3>
          <button onClick={onClose} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal body */}
        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-[var(--color-error)]/20 bg-[var(--color-error)]/5 px-3 py-2 text-xs text-[var(--color-error)]">
              {error}
            </div>
          )}

          {/* Preset selector */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">服务商预设</label>
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
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
              placeholder="服务商名称"
            />
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Base URL</label>
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
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">API 格式</label>
            <select
              value={apiFormat}
              onChange={(e) => setApiFormat(e.target.value as ApiFormat)}
              className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai_chat">OpenAI Chat</option>
              <option value="openai_responses">OpenAI Responses</option>
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              API Key {mode === 'edit' && <span className="text-[var(--color-text-tertiary)]">(留空则不修改)</span>}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
              placeholder={mode === 'edit' ? '••••••••' : '输入 API Key'}
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">主模型 ID</label>
            <input
              type="text"
              value={models.main}
              onChange={(e) => setModels({ ...models, main: e.target.value })}
              className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
              placeholder="模型 ID"
            />
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">haiku/sonnet/opus 将自动与主模型保持一致</p>
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
            <label htmlFor="image-input" className="text-sm text-[var(--color-text-secondary)]">支持图片输入</label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">备注（可选）</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)] resize-none"
              placeholder="备注信息"
            />
          </div>
        </div>

        {/* Modal footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="px-4 py-2 text-sm font-semibold text-[var(--color-btn-primary-fg)] rounded-lg transition-all hover:brightness-105 disabled:opacity-30"
            style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
          >
            {isSubmitting ? '保存中...' : mode === 'create' ? '添加' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
