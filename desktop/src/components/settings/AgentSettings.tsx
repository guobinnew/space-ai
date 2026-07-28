/**
 * AgentSettings — 智能体管理设置
 *
 * 显示内置智能体和自定义智能体列表，
 * 支持创建、编辑、删除自定义智能体。
 */

import { useState, useEffect, useCallback } from 'react'
import { agentsApi, type AgentDefinition, type CreateAgentInput } from '../../api/agents'
import { useTranslation } from '../../i18n'

// ─── Icons ───

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

// ─── Agent Card ───

function AgentCard({
  agent,
  onEdit,
  onDelete,
  onView,
}: {
  agent: AgentDefinition
  onEdit?: () => void
  onDelete?: () => void
  onView: () => void
}) {
  const t = useTranslation()
  const isBuiltIn = agent.source === 'built-in'

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
              {agent.agentType}
            </h4>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              isBuiltIn
                ? 'bg-[var(--color-brand)]/10 text-[var(--color-brand)]'
                : 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
            }`}>
              {isBuiltIn ? t('agent.builtIn') : t('agent.custom')}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)] line-clamp-2">
            {agent.whenToUse}
          </p>
          {agent.model && (
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              {t('agent.model')}: {agent.model === 'inherit' ? t('agent.modelInherit') : agent.model}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          <button
            onClick={onView}
            className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
            title={t('agent.view')}
          >
            <EyeIcon />
          </button>
          {!isBuiltIn && onEdit && (
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
              title={t('agent.edit')}
            >
              <EditIcon />
            </button>
          )}
          {!isBuiltIn && onDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] hover:bg-[var(--color-error)]/10 transition-colors"
              title={t('agent.delete')}
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Agent Detail Modal ───

function AgentDetailModal({
  agent,
  onClose,
}: {
  agent: AgentDefinition
  onClose: () => void
}) {
  const t = useTranslation()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] w-full max-w-2xl max-h-[85vh] flex flex-col mx-4"
        style={{ boxShadow: 'var(--shadow-dropdown)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {agent.agentType}
          </h3>
          <button onClick={onClose} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--color-text-tertiary)]">{t('agent.whenToUse')}</label>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{agent.whenToUse}</p>
          </div>
          {agent.disallowedTools && agent.disallowedTools.length > 0 && (
            <div>
              <label className="text-xs font-medium text-[var(--color-text-tertiary)]">{t('agent.disallowedTools')}</label>
              <div className="mt-1 flex flex-wrap gap-1">
                {agent.disallowedTools.map((tool) => (
                  <span key={tool} className="text-xs px-2 py-0.5 rounded bg-[var(--color-error)]/10 text-[var(--color-error)]">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}
          {agent.availableTools && (
            <div>
              <label className="text-xs font-medium text-[var(--color-text-tertiary)]">{t('agent.availableTools')}</label>
              <div className="mt-1 flex flex-wrap gap-1">
                {agent.availableTools.map((tool) => (
                  <span key={tool} className="text-xs px-2 py-0.5 rounded bg-[var(--color-brand)]/10 text-[var(--color-brand)]">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-[var(--color-text-tertiary)]">{t('agent.systemPrompt')}</label>
            <pre className="mt-1 text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface-container-low)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">
              {agent.systemPrompt}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Agent Edit Modal ───

function AgentEditModal({
  agent,
  onClose,
  onSave,
}: {
  agent: AgentDefinition | null
  onClose: () => void
  onSave: (input: CreateAgentInput) => Promise<void>
}) {
  const t = useTranslation()
  const isEdit = agent !== null
  const [form, setForm] = useState<CreateAgentInput>({
    agentType: agent?.agentType ?? '',
    whenToUse: agent?.whenToUse ?? '',
    systemPrompt: agent?.systemPrompt ?? '',
    model: agent?.model ?? '',
    disallowedTools: agent?.disallowedTools ?? [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!form.agentType.trim()) {
      setError(t('agent.errorName'))
      return
    }
    if (!form.whenToUse.trim()) {
      setError(t('agent.errorDesc'))
      return
    }
    if (!form.systemPrompt.trim()) {
      setError(t('agent.errorPrompt'))
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(form)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full px-3 py-2 text-sm bg-[var(--color-surface-container-low)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-brand)]"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] w-full max-w-lg max-h-[85vh] flex flex-col mx-4"
        style={{ boxShadow: 'var(--shadow-dropdown)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {isEdit ? t('agent.editTitle') : t('agent.addTitle')}
          </h3>
          <button onClick={onClose} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-[var(--color-error)]/10 text-sm text-[var(--color-error)]">{error}</div>
          )}
          <div>
            <label className="text-xs font-medium text-[var(--color-text-tertiary)]">{t('agent.name')}</label>
            <input
              value={form.agentType}
              onChange={(e) => setForm({ ...form, agentType: e.target.value })}
              placeholder={t('agent.namePlaceholder')}
              className={inputClass}
              disabled={isEdit}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-text-tertiary)]">{t('agent.description')}</label>
            <textarea
              value={form.whenToUse}
              onChange={(e) => setForm({ ...form, whenToUse: e.target.value })}
              placeholder={t('agent.descPlaceholder')}
              rows={2}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-text-tertiary)]">{t('agent.systemPrompt')}</label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              placeholder={t('agent.promptPlaceholder')}
              rows={6}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-text-tertiary)]">{t('agent.model')}</label>
            <input
              value={form.model ?? ''}
              onChange={(e) => setForm({ ...form, model: e.target.value || undefined })}
              placeholder={t('agent.modelPlaceholder')}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-text-tertiary)]">{t('agent.disallowedTools')}</label>
            <input
              value={(form.disallowedTools ?? []).join(', ')}
              onChange={(e) => setForm({ ...form, disallowedTools: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder={t('agent.disallowedPlaceholder')}
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border)] flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            {t('agent.cancel')}
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-[var(--color-btn-primary-fg)] rounded-lg hover:brightness-105 disabled:opacity-50 transition-all"
            style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
          >
            {saving ? t('agent.saving') : t('agent.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───

export function AgentSettings() {
  const t = useTranslation()
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [viewAgent, setViewAgent] = useState<AgentDefinition | null>(null)
  const [editAgent, setEditAgent] = useState<AgentDefinition | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const fetchAgents = useCallback(async () => {
    try {
      const { agents: list } = await agentsApi.list()
      setAgents(list)
    } catch {
      // API not ready
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAgents()
  }, [fetchAgents])

  const handleDelete = async (agent: AgentDefinition) => {
    if (!confirm(t('agent.confirmDelete').replace('{name}', agent.agentType))) return
    try {
      await agentsApi.delete(agent.agentType)
      await fetchAgents()
    } catch {
      // Handle error
    }
  }

  const handleCreate = async (input: CreateAgentInput) => {
    await agentsApi.create(input)
    await fetchAgents()
  }

  const handleUpdate = async (input: CreateAgentInput) => {
    await agentsApi.update(input.agentType, input)
    await fetchAgents()
  }

  const builtInAgents = agents.filter((a) => a.source === 'built-in')
  const customAgents = agents.filter((a) => a.source === 'custom')

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('agent.title')}
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {t('agent.desc')}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[var(--color-btn-primary-fg)] rounded-lg hover:brightness-105 transition-all"
          style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
        >
          <PlusIcon />
          {t('agent.add')}
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">{t('agent.loading')}</div>
      ) : (
        <>
          {/* Built-in Agents */}
          {builtInAgents.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-[var(--color-text-tertiary)]">{t('agent.builtInSection')}</h3>
              {builtInAgents.map((agent) => (
                <AgentCard
                  key={agent.agentType}
                  agent={agent}
                  onView={() => setViewAgent(agent)}
                />
              ))}
            </div>
          )}

          {/* Custom Agents */}
          {customAgents.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-[var(--color-text-tertiary)]">{t('agent.customSection')}</h3>
              {customAgents.map((agent) => (
                <AgentCard
                  key={agent.agentType}
                  agent={agent}
                  onView={() => setViewAgent(agent)}
                  onEdit={() => setEditAgent(agent)}
                  onDelete={() => void handleDelete(agent)}
                />
              ))}
            </div>
          )}

          {agents.length === 0 && (
            <div className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">{t('agent.empty')}</div>
          )}
        </>
      )}

      {/* Modals */}
      {viewAgent && <AgentDetailModal agent={viewAgent} onClose={() => setViewAgent(null)} />}
      {editAgent && <AgentEditModal agent={editAgent} onClose={() => setEditAgent(null)} onSave={handleUpdate} />}
      {showAddModal && <AgentEditModal agent={null} onClose={() => setShowAddModal(false)} onSave={handleCreate} />}
    </div>
  )
}
