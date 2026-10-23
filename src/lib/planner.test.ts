import { describe, expect, it } from 'vitest'
import type { EventInput, EventType } from '../types'
import { daysBetween } from './dates'
import { dueDate, suggestedSplit, templatePlanner } from './planner'

const TODAY = '2026-10-23'
const input = (type: EventType, date: string, budget = 1_000_000): EventInput => ({
  type, name: 'Test', date, location: 'Pune', guestCount: 50, budget, theme: 'modern-minimal', preferences: [], notes: '', venueStatus: 'not-started', priorities: [],
})

describe('templatePlanner', () => {
  it.each(['wedding', 'birthday', 'community'] as const)('%s plan: budget lines add up exactly to the budget', (type) => {
    for (const budget of [1000, 123_457, 2_500_000]) {
      const plan = templatePlanner.generate(input(type, '2027-06-01', budget), TODAY)
      expect(plan.expenses.reduce((a, e) => a + e.estimated, 0)).toBe(budget)
      expect(plan.expenses.some((e) => e.category === 'contingency')).toBe(true)
    }
  })

  it.each(['wedding', 'birthday', 'community'] as const)('%s plan: every task is due between today and the event', (type) => {
    for (const date of ['2026-10-24', '2026-11-15', '2027-01-10', '2028-01-10']) {
      const plan = templatePlanner.generate(input(type, date), TODAY)
      expect(plan.tasks.length).toBeGreaterThan(5)
      for (const t of plan.tasks) {
        expect(t.dueDate >= TODAY, `${type} ${date} ${t.title} ${t.dueDate}`).toBe(true)
        expect(t.dueDate <= date).toBe(true)
        expect(t.done).toBe(false)
      }
    }
  })

  it('uses the template offsets as written when there is a long runway', () => {
    const plan = templatePlanner.generate(input('birthday', '2027-06-01'), TODAY)
    const invites = plan.tasks.find((t) => t.title === 'Send invitations')
    expect(daysBetween(invites!.dueDate, '2027-06-01')).toBe(28)
  })

  it('creates a vendor checklist that starts at "to research"', () => {
    const plan = templatePlanner.generate(input('wedding', '2027-06-01'), TODAY)
    expect(plan.vendors.map((v) => v.category)).toEqual(expect.arrayContaining(['venue', 'catering', 'photo']))
    expect(plan.vendors.every((v) => v.status === 'to-research' && v.quote === null)).toBe(true)
  })

  it('gives each generated item a unique id', () => {
    const plan = templatePlanner.generate(input('wedding', '2027-06-01'), TODAY)
    const ids = [...plan.expenses, ...plan.tasks, ...plan.vendors].map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('dueDate', () => {
  it('returns the event date when the event is today or past', () => {
    expect(dueDate('2026-10-23', 30, 100, TODAY)).toBe('2026-10-23')
  })
  it('scales offsets down on a short runway', () => {
    expect(dueDate('2026-11-02', 50, 100, TODAY)).toBe('2026-10-28') // runway 10 days, half of it
  })
})

describe('suggestedSplit', () => {
  it('matches the planner budget lines', () => {
    const split = suggestedSplit('wedding', 987_654)
    expect(split.reduce((a, s) => a + s.amount, 0)).toBe(987_654)
  })
})

