import { useState } from 'react'
import { createScheduledTask, updateScheduledTask, type ScheduledTask } from '../../api/scheduled-tasks'
import { DayOfWeekPicker } from './DayOfWeekPicker'
import { describeCron, isValidCron, parseCron, type FrequencyKey } from '../../lib/cronDescribe'
import { useTranslation } from '../../i18n'

type Props = {
  open: boolean
  onClose: () => void
  editTask?: ScheduledTask
  initialPrompt?: string
}

const MINUTE_INTERVALS = [5, 10, 15, 20, 30]
const HOUR_INTERVALS = [1, 2, 3, 4, 6, 8, 12]
const MINUTE_OFFSETS = [0, 15, 30, 45]

function buildCron(
  freq: FrequencyKey,
  time: string,
  opts: { minuteInterval: number; hourInterval: number; minuteOffset: number; selectedDays: number[]; monthDay: number; customCron: string },
): string {
  const [hours, minutes] = time.split(':').map(Number)
  switch (freq) {
    case 'everyNMinutes': return `*/${opts.minuteInterval} * * * *`
    case 'everyNHours':   return `${opts.minuteOffset} */${opts.hourInterval} * * *`
    case 'daily':         return `${minutes} ${hours} * * *`
    case 'weekdays':      return `${minutes} ${hours} * * 1-5`
    case 'specificDays':  return `${minutes} ${hours} * * ${[...opts.selectedDays].sort((a, b) => a - b).join(',')}`
    case 'monthly':       return `${minutes} ${hours} ${opts.monthDay} * *`
    case 'customCron':    return opts.customCron.trim()
  }
}

const FREQUENCIES: { value: FrequencyKey; key: string }[] = [
  { value: 'everyNMinutes', key: 'task.freqMinutes' },
  { value: 'everyNHours',   key: 'task.freqHours' },
  { value: 'daily',         key: 'task.freqDaily' },
  { value: 'weekdays',      key: 'task.freqWeekdays' },
  { value: 'specificDays',  key: 'task.freqWeekly' },
  { value: 'monthly',       key: 'task.freqMonthly' },
  { value: 'customCron',    key: 'task.freqCron' },
]

export function NewTaskModal({ open, onClose, editTask, initialPrompt }: Props) {
  const t = useTranslation()
  const isEdit = !!editTask
  const parsed = editTask ? parseCron(editTask.cron) : null

  const [name, setName] = useState(editTask?.name || '')
  const [description, setDescription] = useState(editTask?.description || '')
  const [prompt, setPrompt] = useState(editTask?.prompt || initialPrompt || '')
  const [folderPath, setFolderPath] = useState(editTask?.folderPath || '')
  const [frequency, setFrequency] = useState<FrequencyKey>(parsed?.frequency || 'daily')
  const [time, setTime] = useState(parsed?.time || '09:00')
  const [minuteInterval, setMinuteInterval] = useState(parsed?.minuteInterval || 15)
  const [hourInterval, setHourInterval] = useState(parsed?.hourInterval || 1)
  const [minuteOffset, setMinuteOffset] = useState(parsed?.minuteOffset || 0)
  const [selectedDays, setSelectedDays] = useState<number[]>(parsed?.selectedDays || [1])
  const [monthDay, setMonthDay] = useState(parsed?.monthDay || 1)
  const [customCron, setCustomCron] = useState(parsed?.customCron || '0 9 * * *')
  const [saving, setSaving] = useState(false)

  const showTime = ['daily', 'weekdays', 'specificDays', 'monthly'].includes(frequency)
  const cronValue = buildCron(frequency, time, {
    minuteInterval, hourInterval, minuteOffset, selectedDays, monthDay, customCron,
  })
  const canSubmit = name.trim() && description.trim() && prompt.trim() &&
    (frequency !== 'customCron' || isValidCron(customCron)) &&
    (frequency !== 'specificDays' || selectedDays.length > 0)

  const handlePickFolder = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const dir = await open({ directory: true, multiple: false, title: t('task.pickDir') })
      if (dir) setFolderPath(dir)
    } catch { /* 非 Tauri 环境忽略 */ }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true)
    try {
      const fields = { name: name.trim(), description: description.trim(), cron: cronValue, prompt: prompt.trim(), folderPath: folderPath || undefined }
      if (isEdit) {
        await updateScheduledTask(editTask!.id, fields)
      } else {
        await createScheduledTask(fields)
      }
      onClose()
    } catch (err) {
      console.error('Failed to save task:', err)
    }
    setSaving(false)
  }

  if (!open) return null

  const selectClass = 'w-full h-10 px-3 pr-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] appearance-none cursor-pointer'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[var(--color-border)]">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            {isEdit ? t('task.editTitle') : t('task.newTitle')}
          </h2>
          <button onClick={onClose} className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">

          {/* Info banner */}
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-[var(--color-surface-container)]">
            <svg className="w-4 h-4 text-[var(--color-text-secondary)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span className="text-xs text-[var(--color-text-secondary)]">{t('task.infoBanner')}</span>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">{t('task.labelName')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] transition-colors"
              placeholder={t('task.placeholderName')} autoFocus />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">{t('task.labelDesc')}</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] transition-colors"
              placeholder={t('task.placeholderDesc')} />
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">{t('task.labelContent')}</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
              rows={4} style={{ minHeight: 100 }}
              className="w-full resize-y px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] transition-colors"
              placeholder={t('task.placeholderContent')} />
          </div>

          {/* Work directory */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">{t('task.labelWorkDir')}</label>
            <div className="flex items-center gap-2">
              <input value={folderPath} onChange={(e) => setFolderPath(e.target.value)}
                className="flex-1 h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] transition-colors"
                placeholder={t('task.placeholderWorkDir')} />
              <button type="button" onClick={handlePickFolder}
                className="h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-container)] transition-colors shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>
              </button>
              {folderPath && (
                <button type="button" onClick={() => setFolderPath('')}
                  className="h-10 w-10 flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-colors shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">{t('task.labelFrequency')}</label>
            <div className="relative">
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as FrequencyKey)}
                className={selectClass}>
                {FREQUENCIES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{t(opt.key)}</option>
                ))}
              </select>
              <svg className="w-4 h-4 text-[var(--color-text-tertiary)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>

          {/* Sub-controls */}
          {frequency === 'everyNMinutes' && (
            <div className="relative">
              <select value={minuteInterval} onChange={(e) => setMinuteInterval(Number(e.target.value))} className={selectClass}>
                {MINUTE_INTERVALS.map((n) => <option key={n} value={n}>{t('task.everyNMinutes', { n })}</option>)}
              </select>
              <svg className="w-4 h-4 text-[var(--color-text-tertiary)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          )}

          {frequency === 'everyNHours' && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select value={hourInterval} onChange={(e) => setHourInterval(Number(e.target.value))} className={selectClass}>
                  {HOUR_INTERVALS.map((n) => <option key={n} value={n}>{t('task.everyNHours', { n })}</option>)}
                </select>
                <svg className="w-4 h-4 text-[var(--color-text-tertiary)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              <div className="relative flex-1">
                <select value={minuteOffset} onChange={(e) => setMinuteOffset(Number(e.target.value))} className={selectClass}>
                  {MINUTE_OFFSETS.map((m) => <option key={m} value={m}>{t('task.atMM', { mm: String(m).padStart(2, '0') })}</option>)}
                </select>
                <svg className="w-4 h-4 text-[var(--color-text-tertiary)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          )}

          {frequency === 'specificDays' && (
            <DayOfWeekPicker selected={selectedDays} onChange={setSelectedDays} />
          )}

          {frequency === 'monthly' && (
            <div className="relative">
              <select value={monthDay} onChange={(e) => setMonthDay(Number(e.target.value))} className={selectClass}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{t('task.monthDay', { d })}</option>)}
              </select>
              <svg className="w-4 h-4 text-[var(--color-text-tertiary)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          )}

          {frequency === 'customCron' && (
            <div>
              <input type="text" value={customCron} onChange={(e) => setCustomCron(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-mono text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]"
                placeholder={t('task.cronPlaceholder')} />
              <span className="text-xs text-[var(--color-text-tertiary)] mt-1">{t('task.cronFormat')}</span>
              {customCron.trim() && !isValidCron(customCron) && (
                <span className="block text-xs text-[var(--color-error)] mt-1">{t('task.cronInvalid')}</span>
              )}
            </div>
          )}

          {/* Time picker */}
          {showTime && (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">{t('task.labelExecTime')}</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                className="h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]"
                style={{ maxWidth: 120 }} />
            </div>
          )}

          {/* Cron preview */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-surface-container)] text-xs text-[var(--color-text-secondary)]">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>
              {frequency === 'customCron' && customCron.trim() && !isValidCron(customCron)
                ? t('task.cronInvalid')
                : describeCron(cronValue)
              }
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border)]">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-container)] transition-colors">
            {t('common.cancel')}
          </button>
          <button onClick={handleSubmit} disabled={!canSubmit || saving}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--color-brand)] text-white hover:opacity-90 disabled:opacity-40 transition-all">
            {saving ? t('task.saving') : isEdit ? t('common.confirm') : t('task.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
