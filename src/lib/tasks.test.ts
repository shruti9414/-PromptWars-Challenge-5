import { describe, expect, it } from 'vitest'
import { createDemoEvents } from '../data/demo'
import type { Guest, Task } from '../types'
import { addDays, daysBetween, describeDays, formatDate, isValidISODate, todayISO } from './dates'
import { buildInsights } from './insights'
import { groupTasks, guestStats, sortTasks, taskProgress } from './tasks'

const TODAY = '2026-10-23'
const task = (id: string, dueDate: string, done = false, priority: Task['priority'] = 'medium'): Task => ({ id, title: id, dueDate, done, priority })
const guest = (rsvp: Guest['rsvp'], plusOnes = 0): Guest => ({ id: Math.random().toString(), name: 'G', group: 'friends', rsvp, plusOnes, dietary: '' })

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isValidISODate('2028-02-29')).toBe(true)
    expect(isValidISODate('2027-02-29')).toBe(false)
    expect(isValidISODate('2027-13-01')).toBe(false)
    expect(isValidISODate('27-1-1')).toBe(false)
  })
  it('does date arithmetic without timezone drift', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-10-23', '2027-01-01')).toBe(70)
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
  it('formats and describes', () => {
    expect(formatDate('2026-10-23')).toBe('October 23, 2026')
    expect(describeDays(0)).toBe('today')
    expect(describeDays(-3)).toBe('3 days ago')
    expect(describeDays(12)).toBe('in 12 days')
  })
})

describe('groupTasks', () => {
  const tasks = [
    task('late', '2026-10-01'),
    task('nov-b', '2026-11-20', false, 'low'),
    task('nov-a', '2026-11-20', false, 'high'),
    task('dec', '2026-12-05'),
    task('done-old', '2026-09-01', true),
  ]
  it('puts overdue first, then months in order, then completed', () => {
    const groups = groupTasks(tasks, TODAY)
    expect(groups.map((g) => g.id)).toEqual(['overdue', '2026-11', '2026-12', 'done'])
    expect(groups[0]?.tasks.map((t) => t.id)).toEqual(['late'])
    expect(groups[3]?.tasks.map((t) => t.id)).toEqual(['done-old'])
  })
  it('does not treat completed tasks as overdue', () => {
    expect(groupTasks([task('x', '2020-01-01', true)], TODAY).map((g) => g.id)).toEqual(['done'])
  })
  it('sorts same-day tasks by priority', () => {
    expect(sortTasks(tasks).filter((t) => t.dueDate === '2026-11-20').map((t) => t.id)).toEqual(['nov-a', 'nov-b'])
  })
  it('computes progress', () => {
    expect(taskProgress(tasks)).toEqual({ done: 1, total: 5, percent: 20 })
    expect(taskProgress([])).toEqual({ done: 0, total: 0, percent: 0 })
  })
})

describe('guestStats', () => {
  it('counts RSVPs and headcount including plus-ones', () => {
    const s = guestStats([guest('accepted', 2), guest('accepted'), guest('maybe', 1), guest('pending'), guest('declined', 3)])
    expect(s).toMatchObject({ invited: 5, accepted: 2, maybe: 1, pending: 1, declined: 1, confirmedHeadcount: 4, potentialHeadcount: 7 })
    expect(s.responseRate).toBe(80)
  })
  it('handles an empty list', () => {
    expect(guestStats([]).responseRate).toBe(0)
  })
})

describe('buildInsights', () => {
  it('flags overdue tasks and the unbooked caterer in the sample wedding', () => {
    const wedding = createDemoEvents(TODAY)[0]!
    const ids = buildInsights(wedding, TODAY).map((i) => i.id)
    expect(ids).toContain('overdue')
  })
  it('warns when over budget', () => {
    const wedding = { ...createDemoEvents(TODAY)[0]!, budget: 1000 }
    expect(buildInsights(wedding, TODAY).map((i) => i.id)).toContain('over-budget')
  })
  it('says everything is on track when nothing needs attention', () => {
    const base = createDemoEvents(TODAY)[2]!
    const calm = { ...base, tasks: base.tasks.map((t) => ({ ...t, done: true })), vendors: base.vendors.map((v) => ({ ...v, status: 'booked' as const })) }
    expect(buildInsights(calm, TODAY).map((i) => i.id)).toEqual(['on-track'])
  })
})
