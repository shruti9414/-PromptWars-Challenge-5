import { describe, expect, it } from 'vitest'
import { createDemoState } from '../data/demo'
import { parseStateDetailed } from '../state/persistence'
import { reducer } from '../state/reducer'
import type { Expense, Task } from '../types'
import { summarizeBudget, sumMoney } from './budget'
import { isOverdue, sortTasks } from './tasks'
import { parseNumber, validateExpense, validateGuest, validateTask, validateVendor } from './validation'

const TODAY = '2026-10-23'
const exp = (estimated: number, actual: number | null = null, paid = false): Expense => ({ id: String(Math.random()), title: 'x', category: 'venue', estimated, actual, paid })
const form = (estimated: string, actual = '') => ({ title: 'Hall', category: 'venue' as const, estimated, actual })

describe('budget arithmetic edge cases', () => {
  it('does not drift on decimals', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3)
    expect(summarizeBudget(1, [exp(0.1), exp(0.2)]).committed).toBe(0.3)
    expect(summarizeBudget(100, [exp(33.33), exp(33.33), exp(33.33)]).remaining).toBe(0.01)
  })
  it('handles zero values and an empty list', () => {
    const s = summarizeBudget(0, [])
    expect(s).toMatchObject({ planned: 0, committed: 0, remaining: 0, percentCommitted: 0, overBudget: false })
    expect(summarizeBudget(0, [exp(0)]).overBudget).toBe(false)
  })
  it('uses the actual amount over the estimate and counts only paid items as paid', () => {
    const s = summarizeBudget(1000, [exp(400, 500, true), exp(300, null, false), exp(100, 0, true)])
    expect(s).toMatchObject({ planned: 800, committed: 800, paid: 500, remaining: 200 })
  })
  it('reports overruns exactly and copes with very large amounts', () => {
    const s = summarizeBudget(1000, [exp(600), exp(500.5)])
    expect(s).toMatchObject({ overBudget: true, overBy: 100.5, remaining: -100.5 })
    const big = summarizeBudget(1e9, [exp(999_999_999.99), exp(0.01)])
    expect(big.remaining).toBe(0)
    expect(big.overBudget).toBe(false)
  })
})

describe('money input validation', () => {
  it('parses plain, comma-grouped and decimal numbers only', () => {
    expect(parseNumber('1,25,000')).toBe(125000)
    expect(parseNumber(' 12.50 ')).toBe(12.5)
    for (const bad of ['abc', '1e5', '--5', '5.', '.5', 'Infinity', 'NaN', '1 000', '0x10', '']) expect(parseNumber(bad), bad).toBeNull()
  })
  it('rounds to two decimals, accepts zero, and rejects negative, huge or invalid values', () => {
    expect(validateExpense(form('10.456')).value.estimated).toBe(10.46)
    expect(validateExpense(form('0')).errors.estimated).toBeUndefined()
    expect(validateExpense(form('-1')).errors.estimated).toMatch(/negative/i)
    expect(validateExpense(form('1000000001')).errors.estimated).toMatch(/too large/i)
    expect(validateExpense(form('abc')).errors.estimated).toMatch(/valid number/i)
    expect(validateExpense(form('')).errors.estimated).toMatch(/enter/i)
    expect(validateExpense(form('5', 'x')).errors.actual).toMatch(/valid number/i)
    expect(validateExpense(form('5', '-3')).errors.actual).toMatch(/negative/i)
    expect(validateExpense(form('5', '')).value.actual).toBeNull()
    expect(validateExpense(form('5', '0')).value.actual).toBe(0)
  })
  it('strips control characters and rejects blank names', () => {
    expect(validateExpense({ ...form('5'), title: '  \u0000Hall\u0007  ' }).value.title).toBe('Hall')
    expect(validateExpense({ ...form('5'), title: '   ' }).errors.title).toBeDefined()
    expect(validateVendor({ name: ' ', category: 'venue', status: 'to-research', quote: '', notes: '' }).errors.name).toBeDefined()
    expect(validateVendor({ name: 'V', category: 'venue', status: 'to-research', quote: '-5', notes: '' }).errors.quote).toBeDefined()
    expect(validateVendor({ name: 'V', category: 'venue', status: 'to-research', quote: '', notes: 'n'.repeat(301) }).errors.notes).toBeDefined()
  })
  it('validates guest plus-ones and names', () => {
    const g = (plusOnes: string, name = 'Asha') => validateGuest({ name, group: 'family', rsvp: 'pending', plusOnes, dietary: '' }).errors
    expect(g('')).toEqual({})
    expect(g('2')).toEqual({})
    expect(g('1.5').plusOnes).toBeDefined()
    expect(g('-1').plusOnes).toBeDefined()
    expect(g('11').plusOnes).toBeDefined()
    expect(g('2', '').name).toBeDefined()
  })
})

describe('task dates and ordering', () => {
  const t = (id: string, dueDate: string, extra: Partial<Task> = {}): Task => ({ id, title: id, dueDate, priority: 'medium', done: false, ...extra })

  it('rejects impossible dates, and dates after the event unless the task already had that date', () => {
    expect(validateTask({ title: 'A', dueDate: '2026-02-30', priority: 'low' }).errors.dueDate).toBeDefined()
    expect(validateTask({ title: 'A', dueDate: '', priority: 'low' }).errors.dueDate).toBeDefined()
    expect(validateTask({ title: 'A', dueDate: '2026-12-01', priority: 'low' }, { maxDate: '2026-11-30' }).errors.dueDate).toMatch(/after the event/)
    expect(validateTask({ title: 'A', dueDate: '2026-11-30', priority: 'low' }, { maxDate: '2026-11-30' }).errors.dueDate).toBeUndefined()
    expect(validateTask({ title: 'A', dueDate: '2026-12-01', priority: 'low' }, { maxDate: '2026-11-30', keep: '2026-12-01' }).errors.dueDate).toBeUndefined()
    expect(validateTask({ title: 'A', dueDate: '2020-01-01', priority: 'low' }, { maxDate: '2026-11-30' }).errors.dueDate).toBeUndefined()
  })
  it('orders by date, then planner order, then priority', () => {
    const sorted = sortTasks([
      t('late', '2026-12-01'),
      t('b', '2026-11-01', { order: 2 }),
      t('a', '2026-11-01', { order: 1 }),
      t('low', '2026-10-30', { priority: 'low' }),
      t('high', '2026-10-30', { priority: 'high' }),
    ])
    expect(sorted.map((x) => x.id)).toEqual(['high', 'low', 'a', 'b', 'late'])
  })
  it('flags overdue only for open tasks strictly before today', () => {
    expect(isOverdue(t('y', '2026-10-22'), TODAY)).toBe(true)
    expect(isOverdue(t('today', TODAY), TODAY)).toBe(false)
    expect(isOverdue(t('done', '2026-01-01', { done: true }), TODAY)).toBe(false)
  })
})

describe('tampered storage', () => {
  const base = createDemoState(TODAY)
  const withFirst = (patch: object) => JSON.stringify({ version: 1, ...base, events: [{ ...base.events[0], ...patch }, ...base.events.slice(1)] })

  it('drops events with negative, absurd or fractional numbers instead of trusting them', () => {
    const e0 = base.events[0]!
    const cases: object[] = [
      { budget: -5 },
      { budget: 1e15 },
      { guestCount: 0 },
      { guestCount: 2.5 },
      { expenses: [{ ...e0.expenses[0], estimated: -1 }] },
      { expenses: [{ ...e0.expenses[0], actual: -1 }] },
      { vendors: [{ ...e0.vendors[0], quote: -10 }] },
      { guests: [{ id: 'g', name: 'A', group: 'family', rsvp: 'pending', plusOnes: 1.5, dietary: '' }] },
      { tasks: [{ ...e0.tasks[0], dueDate: '2026-02-30' }] },
      { type: 'conference' },
      { coverImage: 'javascript:alert(1)' },
    ]
    for (const c of cases) {
      const r = parseStateDetailed(withFirst(c))
      expect(r.dropped, JSON.stringify(c).slice(0, 60)).toBe(1)
      expect(r.state?.events).toHaveLength(base.events.length - 1)
    }
  })
  it('keeps unknown extra fields from breaking the load', () => {
    expect(parseStateDetailed(withFirst({ somethingNew: true })).dropped).toBe(0)
  })
})

describe('events are isolated from each other', () => {
  const state = createDemoState(TODAY)
  const [a, b] = state.events
  const idA = a!.id
  const idB = b!.id

  it('adding, editing and removing records on one event never touches another', () => {
    let s = reducer(state, { type: 'item/upsert', eventId: idA, collection: 'guests', item: { id: 'new-g', name: 'New', group: 'friends', rsvp: 'pending', plusOnes: 0, dietary: '' } })
    s = reducer(s, { type: 'item/upsert', eventId: idA, collection: 'expenses', item: { id: 'new-e', title: 'Extra', category: 'venue', estimated: 1, actual: null, paid: false } })
    s = reducer(s, { type: 'item/upsert', eventId: idA, collection: 'tasks', item: { id: 'new-t', title: 'T', dueDate: TODAY, priority: 'low', done: false } })
    s = reducer(s, { type: 'item/upsert', eventId: idA, collection: 'vendors', item: { id: 'new-v', category: 'venue', name: 'V', status: 'to-research', quote: null, notes: '' } })
    s = reducer(s, { type: 'vendor/favorite', eventId: idA, directoryId: 'dv-venue-1' })
    s = reducer(s, { type: 'idea/toggle', eventId: idA, ideaId: 'idea-x' })
    expect(s.events.find((e) => e.id === idB)).toBe(b)
    const changed = s.events.find((e) => e.id === idA)!
    expect(changed.guests.map((g) => g.id)).toContain('new-g')
    s = reducer(s, { type: 'item/remove', eventId: idA, collection: 'guests', itemId: 'new-g' })
    expect(s.events.find((e) => e.id === idA)!.guests.some((g) => g.id === 'new-g')).toBe(false)
    expect(s.events.find((e) => e.id === idB)).toBe(b)
  })
  it('an upsert aimed at an unknown event changes nothing', () => {
    const s = reducer(state, { type: 'item/upsert', eventId: 'ghost', collection: 'guests', item: { id: 'g', name: 'A', group: 'family', rsvp: 'pending', plusOnes: 0, dietary: '' } })
    expect(s.events).toEqual(state.events)
  })
  it('deleting the active event selects another one and deleting the last leaves none', () => {
    let s = reducer({ ...state, activeEventId: idA }, { type: 'event/remove', id: idA })
    expect(s.activeEventId).toBe(s.events[0]?.id)
    for (const e of s.events) s = reducer(s, { type: 'event/remove', id: e.id })
    expect(s.events).toEqual([])
    expect(s.activeEventId).toBeNull()
  })
})
