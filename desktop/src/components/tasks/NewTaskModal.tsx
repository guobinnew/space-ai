import { useState } from 'react'
import { createScheduledTask, updateScheduledTask, type ScheduledTask } from '../../api/scheduled-tasks'
import { DayOfWeekPicker } from './DayOfWeekPicker'
import { describeCron, isValidCron, parseCron, type FrequencyKey } from '../../lib/cronDescribe'

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

const FREQUENCIES: { value: FrequencyKey; label: string }[] = [
  { value: 'everyNMinutes', label: '每N分钟' },
  { value: 'everyNHours',   label: '每N小时' },
  { value: 'daily',         label: '每天' },
  { value: 'weekdays',      label: '工作日' },
  { value: 'specificDays',  label: '指定星期' },
  { value: 'monthly',       label: '每月' },
  { value: 'customCron',    label: '自定义 Cron' },
]

export function NewTaskModal({ open, onClose, editTask, initialPrompt }: Props) {
  const isEdit = !!editTask
  const parsed = editTask ? parseCron(editTask.cron) : null

  const [name, setName] = useState(editTask?.name || '')
  const [description, setDescription] = useState(editTask?.description || '')
  const [prompt, setPrompt] = useState(editTask?.prompt || initialPrompt || '')
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

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true)
    try {
      const fields = { name: name.trim(), description: description.trim(), cron: cronValue, prompt: prompt.trim() }
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
            {isEdit ? '编辑任务' : '新建定时任务'}
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
            <span className="text-xs text-[var(--color-text-secondary)]">定时任务通过后台调度执行，不保证实时性。</span>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">名称 <span className="text-[var(--color-error)]">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] transition-colors"
              placeholder="任务名称" autoFocus />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">描述 <span className="text-[var(--color-error)]">*</span></label>
            <input value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] transition-colors"
              placeholder="任务描述" />
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">任务内容 <span className="text-[var(--color-error)]">*</span></label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
              rows={4} style={{ minHeight: 100 }}
              className="w-full resize-y px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)] transition-colors"
              placeholder="输入要执行的任务描述..." />
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">重复频率</label>
            <div className="relative">
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as FrequencyKey)}
                className={selectClass}>
                {FREQUENCIES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <svg className="w-4 h-4 text-[var(--color-text-tertiary)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>

          {/* Sub-controls */}
          {frequency === 'everyNMinutes' && (
            <div className="relative">
              <select value={minuteInterval} onChange={(e) => setMinuteInterval(Number(e.target.value))} className={selectClass}>
                {MINUTE_INTERVALS.map((n) => <option key={n} value={n}>每 {n} 分钟</option>)}
              </select>
              <svg className="w-4 h-4 text-[var(--color-text-tertiary)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          )}

          {frequency === 'everyNHours' && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select value={hourInterval} onChange={(e) => setHourInterval(Number(e.target.value))} className={selectClass}>
                  {HOUR_INTERVALS.map((n) => <option key={n} value={n}>每 {n} 小时</option>)}
                </select>
                <svg className="w-4 h-4 text-[var(--color-text-tertiary)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              <div className="relative flex-1">
                <select value={minuteOffset} onChange={(e) => setMinuteOffset(Number(e.target.value))} className={selectClass}>
                  {MINUTE_OFFSETS.map((m) => <option key={m} value={m}>:{String(m).padStart(2, '0')} 分</option>)}
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
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>每月 {d} 号</option>)}
              </select>
              <svg className="w-4 h-4 text-[var(--color-text-tertiary)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          )}

          {frequency === 'customCron' && (
            <div>
              <input type="text" value={customCron} onChange={(e) => setCustomCron(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-mono text-[var(--color-text-primary)] outline-none focus:border-[var(--color-brand)]"
                placeholder="分 时 日 月 周" />
              <span className="text-xs text-[var(--color-text-tertiary)] mt-1">格式：分 时 日 月 周</span>
              {customCron.trim() && !isValidCron(customCron) && (
                <span className="block text-xs text-[var(--color-error)] mt-1">无效的 cron 表达式</span>
              )}
            </div>
          )}

          {/* Time picker */}
          {showTime && (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">执行时间</label>
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
                ? '无效的 cron 表达式'
                : describeCron(cronValue)
              }
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border)]">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-container)] transition-colors">
            取消
          </button>
          <button onClick={handleSubmit} disabled={!canSubmit || saving}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--color-brand)] text-white hover:opacity-90 disabled:opacity-40 transition-all">
            {saving ? '保存中...' : isEdit ? '保存' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}
