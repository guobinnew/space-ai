import { useTranslation } from '../../i18n'

type Props = { selected: number[]; onChange: (days: number[]) => void }

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DAY_KEYS = ['task.day1', 'task.day2', 'task.day3', 'task.day4', 'task.day5', 'task.day6', 'task.day7']

export function DayOfWeekPicker({ selected, onChange }: Props) {
  const t = useTranslation()
  const toggle = (day: number) => {
    if (selected.includes(day)) {
      if (selected.length <= 1) return
      onChange(selected.filter((d) => d !== day))
    } else {
      onChange([...selected, day])
    }
  }

  return (
    <div className="flex gap-1.5">
      {DAY_ORDER.map((day, idx) => {
        const isActive = selected.includes(day)
        return (
          <button key={day} type="button" onClick={() => toggle(day)}
            className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
              isActive
                ? 'bg-[var(--color-brand)]/15 text-[var(--color-brand)] border border-[var(--color-brand)]/40'
                : 'bg-[var(--color-surface)] text-[var(--color-text-tertiary)] border border-[var(--color-border)] hover:bg-[var(--color-surface-container)]'
            }`}
          >
            {t(DAY_KEYS[idx])}
          </button>
        )
      })}
    </div>
  )
}
