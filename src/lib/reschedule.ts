import type { Task } from '../types'
import { addDays, daysBetween } from './dates'

export interface TaskShift {
  task: Task
  from: string
  to: string
  /** True for tasks the user created or edited themselves; they are only moved if the user agrees. */
  manual: boolean
}

export interface ReschedulePlan {
  shifts: TaskShift[]
  /** True when the new runway is shorter than the old plan, so offsets were scaled down. */
  compressed: boolean
}

/**
 * Works out where each open task would land if the event moved from `oldDate` to `newDate`.
 * Each task keeps its distance from the event; if the new date leaves less time than the longest
 * lead, distances are shrunk proportionally so nothing lands in the past. Completed tasks never move.
 * The mapping never reorders tasks, so a prerequisite is never pushed after the task that needs it.
 */
export function planReschedule(tasks: Task[], oldDate: string, newDate: string, today: string): ReschedulePlan {
  const open = tasks.filter((t) => !t.done)
  const maxLead = open.reduce((m, t) => Math.max(m, daysBetween(t.dueDate, oldDate)), 0)
  const runway = Math.max(daysBetween(today, newDate), 0)
  const compressed = maxLead > runway && maxLead > 0
  const scale = compressed ? runway / maxLead : 1
  const shifts: TaskShift[] = []
  for (const task of open) {
    const lead = daysBetween(task.dueDate, oldDate)
    const newLead = lead > 0 ? Math.floor(lead * scale) : lead
    const to = addDays(newDate, -newLead)
    if (to !== task.dueDate) shifts.push({ task, from: task.dueDate, to, manual: Boolean(task.manual) })
  }
  return { shifts, compressed }
}

/** Applies the chosen shifts; every other task is returned unchanged. */
export function applyReschedule(tasks: Task[], shifts: TaskShift[], moveIds: ReadonlySet<string>): Task[] {
  const target = new Map(shifts.filter((s) => moveIds.has(s.task.id)).map((s) => [s.task.id, s.to]))
  return tasks.map((t) => (target.has(t.id) ? { ...t, dueDate: target.get(t.id) as string } : t))
}
