import type { Task } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Weeks (Monday first) for a month; days outside the month are null. `month` is 1-12. */
export function monthMatrix(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const lead = (first.getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`)
  while (cells.length % 7) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function shiftMonth(ym: string, delta: number): string {
  const [y = 0, m = 1] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

export function tasksByDate(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>()
  for (const t of tasks) map.set(t.dueDate, [...(map.get(t.dueDate) ?? []), t])
  return map
}
