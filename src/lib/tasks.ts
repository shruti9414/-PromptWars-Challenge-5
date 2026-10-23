import type { Guest, Priority, Task, VendorBooking } from '../types'
import { daysBetween, formatDate } from './dates'

export interface TaskGroup {
  id: string
  label: string
  tasks: Task[]
  tone: 'overdue' | 'open' | 'done'
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || (a.order ?? 999) - (b.order ?? 999) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  )
}

export function isOverdue(task: Task, today: string): boolean {
  return !task.done && task.dueDate < today
}

/** Overdue first, then one group per month of open tasks, then completed tasks. */
export function groupTasks(tasks: Task[], today: string): TaskGroup[] {
  const sorted = sortTasks(tasks)
  const groups: TaskGroup[] = []
  const overdue = sorted.filter((t) => isOverdue(t, today))
  if (overdue.length) groups.push({ id: 'overdue', label: 'Overdue', tasks: overdue, tone: 'overdue' })
  for (const task of sorted) {
    if (task.done || isOverdue(task, today)) continue
    const id = task.dueDate.slice(0, 7)
    let group = groups.find((g) => g.id === id)
    if (!group) {
      group = { id, label: formatDate(task.dueDate, 'month'), tasks: [], tone: 'open' }
      groups.push(group)
    }
    group.tasks.push(task)
  }
  const done = sorted.filter((t) => t.done)
  if (done.length) groups.push({ id: 'done', label: 'Completed', tasks: done, tone: 'done' })
  return groups
}

export function taskProgress(tasks: Task[]): { done: number; total: number; percent: number } {
  const done = tasks.filter((t) => t.done).length
  return { done, total: tasks.length, percent: tasks.length ? (done / tasks.length) * 100 : 0 }
}

export function vendorProgress(vendors: VendorBooking[]) {
  const booked = vendors.filter((v) => v.status === 'booked' || v.status === 'completed').length
  return { booked, total: vendors.length, percent: vendors.length ? (booked / vendors.length) * 100 : 0 }
}

export interface GuestStats {
  invited: number
  accepted: number
  maybe: number
  declined: number
  pending: number
  /** Accepted guests plus their plus-ones. */
  confirmedHeadcount: number
  /** Headcount if everyone who has not declined shows up. */
  potentialHeadcount: number
  responseRate: number
}

export function guestStats(guests: Guest[]): GuestStats {
  const count = (rsvp: Guest['rsvp']) => guests.filter((g) => g.rsvp === rsvp).length
  const head = (g: Guest) => 1 + g.plusOnes
  const confirmedHeadcount = guests.filter((g) => g.rsvp === 'accepted').reduce((a, g) => a + head(g), 0)
  const potentialHeadcount = guests.filter((g) => g.rsvp !== 'declined').reduce((a, g) => a + head(g), 0)
  const pending = count('pending')
  return {
    invited: guests.length,
    accepted: count('accepted'),
    maybe: count('maybe'),
    declined: count('declined'),
    pending,
    confirmedHeadcount,
    potentialHeadcount,
    responseRate: guests.length ? ((guests.length - pending) / guests.length) * 100 : 0,
  }
}

export function daysLeft(eventDate: string, today: string): number {
  return daysBetween(today, eventDate)
}

