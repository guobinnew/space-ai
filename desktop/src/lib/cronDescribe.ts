/**
 * Cron utilities: human-readable description and validation.
 * Also reverse-parse cron into UI form state.
 */
export type FrequencyKey = 'everyNMinutes' | 'everyNHours' | 'daily' | 'weekdays' | 'specificDays' | 'monthly' | 'customCron'

export type ParsedCron = {
  frequency: FrequencyKey
  time: string
  minuteInterval: number
  hourInterval: number
  minuteOffset: number
  selectedDays: number[]
  monthDay: number
  customCron: string
}

const DEFAULTS: ParsedCron = {
  frequency: 'customCron',
  time: '09:00',
  minuteInterval: 15,
  hourInterval: 1,
  minuteOffset: 0,
  selectedDays: [1],
  monthDay: 1,
  customCron: '',
}

function pad(n: number): string { return n.toString().padStart(2, '0') }
function formatTime(hour: number, minute: number): string { return `${pad(hour)}:${pad(minute)}` }

const DOW_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function describeDow(field: string): string {
  const days: number[] = []
  for (const part of field.split(',')) {
    const range = part.match(/^(\d+)-(\d+)$/)
    if (range) {
      for (let i = parseInt(range[1]!); i <= parseInt(range[2]!); i++) days.push(i)
    } else {
      days.push(parseInt(part))
    }
  }
  return days.map((d) => DOW_LABELS[d % 7]).join(', ')
}

export function describeCron(cron: string): string {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return `自定义: ${cron}`
  const [min, hour, dom, month, dow] = fields as string[]

  if (hour === '*' && dom === '*' && month === '*' && dow === '*') {
    const stepMatch = min.match(/^\*\/(\d+)$/)
    if (stepMatch) {
      const n = parseInt(stepMatch[1]!)
      return n === 1 ? '每分钟' : `每 ${n} 分钟`
    }
    if (min === '*') return '每分钟'
  }

  if (/^\d+$/.test(min) && dom === '*' && month === '*' && dow === '*') {
    const stepMatch = hour.match(/^\*\/(\d+)$/)
    if (stepMatch) {
      const n = parseInt(stepMatch[1]!)
      const m = parseInt(min)
      if (m === 0) return n === 1 ? '每小时' : `每 ${n} 小时`
      return `每 ${n} 小时（${pad(m)}分）`
    }
  }

  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && month === '*') {
    const time = formatTime(parseInt(hour), parseInt(min))
    if (dow === '*') return `每天 ${time}`
    if (dow === '1-5') return `工作日 ${time}`
    if (/^[\d,\-]+$/.test(dow)) return `每 ${describeDow(dow)} ${time}`
  }

  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && month === '*' && dow === '*') {
    return `每月 ${parseInt(dom)} 号 ${formatTime(parseInt(hour), parseInt(min))}`
  }

  return `自定义: ${cron}`
}

export function parseCron(cron: string): ParsedCron {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return { ...DEFAULTS, customCron: cron }
  const [min, hour, dom, month, dow] = fields as string[]

  if (/^\*\/\d+$/.test(min) && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return { ...DEFAULTS, frequency: 'everyNMinutes', minuteInterval: parseInt(min.split('/')[1]!) }
  }
  if (/^\d+$/.test(min) && /^\*\/\d+$/.test(hour) && dom === '*' && month === '*' && dow === '*') {
    return { ...DEFAULTS, frequency: 'everyNHours', minuteOffset: parseInt(min), hourInterval: parseInt(hour.split('/')[1]!) }
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour)) {
    const time = formatTime(parseInt(hour), parseInt(min))
    if (dom === '*' && month === '*' && dow === '*') return { ...DEFAULTS, frequency: 'daily', time }
    if (dom === '*' && month === '*' && dow === '1-5') return { ...DEFAULTS, frequency: 'weekdays', time }
    if (dom === '*' && month === '*' && /^[\d,]+$/.test(dow)) return { ...DEFAULTS, frequency: 'specificDays', time, selectedDays: dow.split(',').map(Number) }
    if (/^\d+$/.test(dom) && month === '*' && dow === '*') return { ...DEFAULTS, frequency: 'monthly', time, monthDay: parseInt(dom) }
  }
  return { ...DEFAULTS, customCron: cron }
}

export function isValidCron(cron: string): boolean {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const maxValues = [59, 23, 31, 12, 7]
  const minValues = [0, 0, 1, 1, 0]
  for (let i = 0; i < 5; i++) {
    const f = fields[i]!
    if (/^\*\/\d+$/.test(f) || f === '*') continue
    if (!/^(\*|(\d+(-\d+)?(\/\d+)?)(,(\d+(-\d+)?(\/\d+)?))*)$/.test(f)) return false
    for (const n of f.replace(/\/\d+/g, '').split(/[,\-]/)) {
      const v = parseInt(n)
      if (v < minValues[i]! || v > maxValues[i]!) return false
    }
  }
  return true
}
