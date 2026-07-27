/**
 * 定时任务管理页
 *
 * 功能：查看列表、创建/编辑/删除、立即执行、运行记录
 */
import { useEffect, useState } from 'react'
import {
  fetchScheduledTasks,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  executeScheduledTask,
  fetchRecentRuns,
  type ScheduledTask,
  type RunRecord,
} from '../api/scheduled-tasks'
import { useTranslation } from '../i18n'

// ─── 频率选项 ────────────────────────────────────────────

type Frequency = { label: string; cron(minute: number, hour: number): string }

const FREQUENCIES: Frequency[] = [
  { label: '每天', cron: (_m: number, h: number) => `${_m} ${h} * * *` },
  { label: '工作日', cron: (m: number, h: number) => `${m} ${h} * * 1-5` },
  { label: '每周一', cron: (m: number, h: number) => `${m} ${h} * * 1` },
  { label: '每周二', cron: (m: number, h: number) => `${m} ${h} * * 2` },
  { label: '每周三', cron: (m: number, h: number) => `${m} ${h} * * 3` },
  { label: '每周四', cron: (m: number, h: number) => `${m} ${h} * * 4` },
  { label: '每周五', cron: (m: number, h: number) => `${m} ${h} * * 5` },
  { label: '每周六', cron: (m: number, h: number) => `${m} ${h} * * 6` },
  { label: '每周日', cron: (m: number, h: number) => `${m} ${h} * * 0` },
  { label: '每小时', cron: () => `0 * * * *` },
  { label: '每2小时', cron: () => `0 */2 * * *` },
  { label: '每6小时', cron: () => `0 */6 * * *` },
  { label: '每12小时', cron: () => `0 */12 * * *` },
]

// 从 cron 反推频率索引和时间
// 每小时/每N小时 无时间选择
const HOMELESS_FREQ = new Set(['每小时', '每2小时', '每6小时', '每12小时'])

function parseCronToFreq(cron: string): { freqLabel: string; hourText: string } {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return { freqLabel: '每天', hourText: '09:00' }
  const [minute, hour, , , dow] = parts as string[]
  const m = parseInt(minute, 10)
  const h = parseInt(hour, 10)
  const hourText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`

  const dowMatch = dow.match(/^\d$/)

  if (hour === '*' && minute === '0') return { freqLabel: '每小时', hourText: '' }
  const stepMatch = hour.match(/^\*\/(\d+)$/)
  if (stepMatch) {
    const n = parseInt(stepMatch[1]!, 10)
    return { freqLabel: `每${n}小时`, hourText: '' }
  }

  if (dow === '1-5') return { freqLabel: '工作日', hourText }
  if (dowMatch) {
    const dayNames = ['每周日', '每周一', '每周二', '每周三', '每周四', '每周五', '每周六']
    return { freqLabel: dayNames[parseInt(dow, 10) % 7], hourText }
  }

  return { freqLabel: '每天', hourText }
}

// ─── 主组件 ──────────────────────────────────────────────

export function ScheduledTasksPage() {
  const t = useTranslation()

  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ScheduledTask | null>(null)
  const [executing, setExecuting] = useState<Set<string>>(new Set())
  const [detailTasks, setDetailTasks] = useState<Set<string>>(new Set())

  // 加载数据
  const load = async () => {
    setLoading(true)
    try {
      const [ts, rs] = await Promise.all([fetchScheduledTasks(), fetchRecentRuns(100)])
      setTasks(ts)
      setRuns(rs)
    } catch (err) {
      console.error('[ScheduledTasks] load error:', err)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // 创建/编辑
  const handleSave = async (fields: { name: string; description?: string; cron: string; prompt: string }) => {
    if (editing) {
      await updateScheduledTask(editing.id, fields)
    } else {
      await createScheduledTask(fields)
    }
    setShowForm(false)
    setEditing(null)
    await load()
  }

  // 删除
  const handleDelete = async (id: string) => {
    if (!confirm(t('scheduledTasks.deleteConfirm') || '确定删除？')) return
    await deleteScheduledTask(id)
    await load()
  }

  // 执行
  const handleExecute = async (task: ScheduledTask) => {
    setExecuting((prev) => new Set(prev).add(task.id))
    try {
      await executeScheduledTask(task.id)
      // 等待 1.5s 后刷新运行记录
      setTimeout(() => load(), 1500)
    } catch (err) {
      console.error('[ScheduledTasks] execute error:', err)
    }
    setExecuting((prev) => { const s = new Set(prev); s.delete(task.id); return s })
  }

  // 切换详情
  const toggleDetail = (id: string) => {
    setDetailTasks((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  // 运行状态样式
  const statusStyle = (s: string) => {
    switch (s) {
      case 'completed': return 'text-[var(--color-success)]'
      case 'running': return 'text-[var(--color-accent)]'
      case 'failed': return 'text-[var(--color-error)]'
      case 'aborted': return 'text-[var(--color-text-tertiary)]'
      default: return ''
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)]">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">{t('scheduledTasks.title') || '定时任务'}</h1>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="px-3 py-1.5 rounded-lg text-sm bg-[var(--color-brand)] text-white hover:opacity-90 transition-opacity"
        >
          + {t('scheduledTasks.newTask') || '新建任务'}
        </button>
      </div>

      {/* 表单弹窗 */}
      {showForm && (
        <TaskForm
          task={editing}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      {/* 主体 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-[var(--color-text-tertiary)]">
            {t('common.loading') || '加载中...'}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-[var(--color-text-tertiary)] gap-2">
            <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span className="text-sm">{t('scheduledTasks.empty') || '暂无定时任务'}</span>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const taskRuns = runs.filter((r) => r.taskId === task.id)
              const expanded = detailTasks.has(task.id)
              return (
                <div key={task.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
                  {/* 任务行 */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* 启用开关 */}
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input type="checkbox" className="sr-only peer"
                        checked={task.enabled !== false}
                        onChange={async (e) => {
                          await updateScheduledTask(task.id, { enabled: e.target.checked })
                          await load()
                        }}
                      />
                      <div className="w-8 h-4 rounded-full bg-[var(--color-border)] peer-checked:bg-[var(--color-brand)] transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-3 after:h-3 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-4" />
                    </label>

                    {/* 名称 + cron */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                          {task.name || task.id.slice(0, 8)}
                        </span>
                        {task.description && (
                          <span className="text-xs text-[var(--color-text-tertiary)] truncate hidden sm:inline">
                            {task.description}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          {(() => {
                            const { freqLabel, hourText } = parseCronToFreq(task.cron)
                            return hourText ? `${freqLabel} ${hourText}` : freqLabel
                          })()}
                        </span>
                        <code className="text-[10px] px-1 py-0.5 rounded bg-[var(--color-surface-container)] text-[var(--color-text-tertiary)] font-mono opacity-60">
                          {task.cron}
                        </code>
                      </div>
                    </div>

                    {/* 操作 */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleExecute(task)}
                        disabled={executing.has(task.id)}
                        className="p-1.5 rounded-lg hover:bg-[var(--color-surface-container)] text-[var(--color-text-secondary)] disabled:opacity-40 transition-colors"
                        title={t('scheduledTasks.runNow') || '立即执行'}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </button>
                      <button
                        onClick={() => { setEditing(task); setShowForm(true) }}
                        className="p-1.5 rounded-lg hover:bg-[var(--color-surface-container)] text-[var(--color-text-secondary)] transition-colors"
                        title={t('common.edit') || '编辑'}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="p-1.5 rounded-lg hover:bg-[var(--color-surface-container)] text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-colors"
                        title={t('common.delete') || '删除'}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                      <button
                        onClick={() => toggleDetail(task.id)}
                        className="p-1.5 rounded-lg hover:bg-[var(--color-surface-container)] text-[var(--color-text-tertiary)] transition-colors"
                      >
                        <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>
                  </div>

                  {/* 展开详情：运行记录 */}
                  {expanded && (
                    <div className="border-t border-[var(--color-border)] px-4 py-3 bg-[var(--color-surface-container)]/30">
                      <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                        {t('scheduledTasks.runHistory') || '运行记录'}
                        <span className="ml-1 text-[var(--color-text-tertiary)]">({taskRuns.length})</span>
                      </div>
                      {taskRuns.length === 0 ? (
                        <div className="text-xs text-[var(--color-text-tertiary)] italic">暂无记录</div>
                      ) : (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {taskRuns.map((r) => (
                            <div key={r.id} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusStyle(r.status)}`} style={{ backgroundColor: 'currentColor' }} />
                              <span className={statusStyle(r.status)}>
                                {r.status === 'completed' ? '成功' : r.status === 'running' ? '执行中' : r.status === 'failed' ? '失败' : '已中止'}
                              </span>
                              <span className="text-[var(--color-text-tertiary)]">{new Date(r.startedAt).toLocaleString('zh-CN')}</span>
                              {r.finishedAt && (
                                <span className="text-[var(--color-text-tertiary)]">
                                  ({((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000).toFixed(1)}s)
                                </span>
                              )}
                              {r.error && <span className="text-[var(--color-error)] truncate max-w-[200px]" title={r.error}>{r.error}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 表单 ────────────────────────────────────────────────

function TaskForm({ task, onSave, onCancel }: {
  task: ScheduledTask | null
  onSave: (fields: { name: string; description?: string; cron: string; prompt: string }) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(task?.name || '')
  const [description, setDescription] = useState(task?.description || '')
  const [prompt, setPrompt] = useState(task?.prompt || '')
  const [saving, setSaving] = useState(false)

  // 从 cron 反推初始值
  const init = task ? parseCronToFreq(task.cron) : { freqLabel: '每天', hourText: '09:00' }
  const [freqLabel, setFreqLabel] = useState(init.freqLabel)
  const [hourText, setHourText] = useState(init.hourText || '09:00')

  // cron 生成
  const buildCron = (): string => {
    const freq = FREQUENCIES.find((f) => f.label === freqLabel)
    if (!freq) return '0 9 * * *'
    if (HOMELESS_FREQ.has(freqLabel)) {
      return freq.cron(0, 0)
    }
    const [h, m] = hourText.split(':').map(Number)
    return freq.cron(m, h)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !prompt.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        cron: buildCron(),
        prompt: prompt.trim(),
      })
    } catch { /* handled */ }
    setSaving(false)
  }

  const noTime = HOMELESS_FREQ.has(freqLabel)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="w-full max-w-lg mx-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            {task ? '编辑任务' : '新建定时任务'}
          </h2>

          {/* 名称（必填） */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              名称 <span className="text-[var(--color-error)]">*</span>
            </label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container)] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] transition-colors"
              placeholder="任务名称"
              autoFocus
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">描述（可选）</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container)] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] transition-colors"
              placeholder="描述"
            />
          </div>

          {/* 时间 + 重复间隔 */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">执行时间</label>
            <div className="flex gap-3">
              {/* 时间选择 */}
              <div className="shrink-0">
                {noTime ? (
                  <div className="h-[38px] flex items-center px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container)] text-sm text-[var(--color-text-tertiary)]">
                    无需时间
                  </div>
                ) : (
                  <input type="time" value={hourText}
                    onChange={(e) => setHourText(e.target.value)}
                    className="h-[38px] px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container)] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] transition-colors"
                  />
                )}
              </div>

              {/* 频率选择 */}
              <select value={freqLabel} onChange={(e) => setFreqLabel(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container)] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] transition-colors"
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.label} value={f.label}>{f.label}</option>
                ))}
              </select>
            </div>
            {/* 生成的 cron 预览 */}
            <code className="block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-container)] text-[var(--color-text-tertiary)] font-mono inline-block">
              cron: {buildCron()}
            </code>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              任务内容 <span className="text-[var(--color-error)]">*</span>
            </label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container)] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] transition-colors resize-none"
              placeholder="输入要执行的任务描述..."
            />
          </div>

          {/* 按钮 */}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel}
              className="px-3 py-1.5 rounded-lg text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-container)] transition-colors"
            >
              取消
            </button>
            <button type="submit" disabled={!name.trim() || !prompt.trim() || saving}
              className="px-4 py-1.5 rounded-lg text-sm bg-[var(--color-brand)] text-white hover:opacity-90 disabled:opacity-40 transition-all"
            >
              {saving ? '保存中...' : task ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
