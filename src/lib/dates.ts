const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

function toUTC(iso: string): number {
  const m = ISO_RE.exec(iso)
  if (!m) return Number.NaN
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** True for a real calendar date written as yyyy-mm-dd. */
export function isValidISODate(value: string): boolean {
  const ms = toUTC(value)
  return !Number.isNaN(ms) && fromUTC(ms) === value
}

/** Today's date in the user's local timezone, as yyyy-mm-dd. */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(iso: string, days: number): string {
  return fromUTC(toUTC(iso) + days * DAY_MS)
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS)
}

export function formatDate(iso: string, style: 'long' | 'short' | 'month' = 'long'): string {
  if (!isValidISODate(iso)) return iso
  const opts: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { day: 'numeric', month: 'long', year: 'numeric' }
      : style === 'short'
        ? { day: 'numeric', month: 'short' }
        : { month: 'long', year: 'numeric' }
  return new Intl.DateTimeFormat('en', { ...opts, timeZone: 'UTC' }).format(new Date(toUTC(iso)))
}

/** "in 12 days", "tomorrow", "3 days ago" ... */
export function describeDays(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`
}
