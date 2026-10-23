import { describe, expect, it } from 'vitest'
import type { Task, VendorBooking } from '../types'
import { daysBetween } from '../lib/dates'
import type { TimelineItemAI, VendorRequirementAI } from './schema'
import { mergeTimeline, mergeVendors, normalizeTimeline, normalizeVendors } from './timeline'

const TODAY = '2026-10-23'
const item = (id: string, daysBeforeEvent: number, over: Partial<TimelineItemAI> = {}): TimelineItemAI => ({
  id, title: `Task ${id}`, description: 'desc', daysBeforeEvent, priority: 'medium', dependsOn: [], bookingDeadline: false, ...over,
})
const byTitle = (tasks: Task[], title: string) => tasks.find((t) => t.title === title)!

describe('normalizeTimeline: dates from the real event date', () => {
  it('computes due dates from the event date, never trusting absolute dates', () => {
    const r = normalizeTimeline([item('a', 60), item('b', 30), item('c', 1)], '2027-03-01', TODAY)
    expect(r.compressed).toBe(false)
    expect(byTitle(r.tasks, 'Task a').dueDate).toBe('2026-12-31')
    expect(daysBetween(byTitle(r.tasks, 'Task b').dueDate, '2027-03-01')).toBe(30)
    expect(r.tasks.every((t) => t.dueDate >= TODAY && t.dueDate <= '2027-03-01')).toBe(true)
  })

  it('numbers tasks in suggested completion order', () => {
    const r = normalizeTimeline([item('late', 2), item('early', 90), item('mid', 30)], '2027-03-01', TODAY)
    expect(r.tasks.map((t) => t.title)).toEqual(['Task early', 'Task mid', 'Task late'])
    expect(r.tasks.map((t) => t.order)).toEqual([1, 2, 3])
  })

  it('compresses proportionally when the plan needs more days than remain', () => {
    const r = normalizeTimeline([item('a', 180), item('b', 90), item('c', 30), item('d', 3)], '2026-11-02', TODAY)
    expect(r.runway).toBe(10)
    expect(r.compressed).toBe(true)
    expect(r.issues.join(' ')).toMatch(/compressed/i)
    for (const t of r.tasks) expect(t.dueDate >= TODAY && t.dueDate <= '2026-11-02').toBe(true)
    expect(byTitle(r.tasks, 'Task a').dueDate).toBe(TODAY)
  })

  it('puts everything on the day when the event is today', () => {
    const r = normalizeTimeline([item('a', 30), item('b', 5)], TODAY, TODAY)
    expect(r.tasks.every((t) => t.dueDate === TODAY)).toBe(true)
  })

  it('refuses to build a timeline for an event in the past', () => {
    const r = normalizeTimeline([item('a', 30)], '2026-10-01', TODAY)
    expect(r.tasks).toEqual([])
    expect(r.issues[0]).toMatch(/already passed/)
  })

  it('adds a last-minute task when nothing is close to the event', () => {
    const r = normalizeTimeline([item('a', 60), item('b', 30)], '2027-03-01', TODAY)
    const last = r.tasks.at(-1)!
    expect(last.title).toMatch(/walkthrough/i)
    expect(last.dueDate).toBe('2027-02-28')
    expect(r.issues.join(' ')).toMatch(/last-minute/i)
  })

  it('does not add one when the model already included it', () => {
    const r = normalizeTimeline([item('a', 60), item('b', 1)], '2027-03-01', TODAY)
    expect(r.tasks).toHaveLength(2)
  })
})

describe('normalizeTimeline: dependencies', () => {
  it('maps dependencies onto the new task ids', () => {
    const r = normalizeTimeline([item('a', 60), item('b', 30, { dependsOn: ['a'] })], '2027-03-01', TODAY)
    expect(byTitle(r.tasks, 'Task b').dependsOn).toEqual([byTitle(r.tasks, 'Task a').id])
  })

  it('removes unknown, self and duplicate dependencies and says so', () => {
    const r = normalizeTimeline([item('a', 60, { dependsOn: ['a', 'ghost'] }), item('b', 30, { dependsOn: ['a', 'a'] })], '2027-03-01', TODAY)
    expect(byTitle(r.tasks, 'Task a').dependsOn).toEqual([])
    expect(byTitle(r.tasks, 'Task b').dependsOn).toHaveLength(1)
    expect(r.issues.join(' ')).toMatch(/unknown task/)
    expect(r.issues.join(' ')).toMatch(/itself/)
  })

  it('breaks circular dependencies', () => {
    const r = normalizeTimeline([item('a', 60, { dependsOn: ['b'] }), item('b', 30, { dependsOn: ['a'] })], '2027-03-01', TODAY)
    expect(r.issues.join(' ')).toMatch(/circular/i)
    const [a, b] = [byTitle(r.tasks, 'Task a'), byTitle(r.tasks, 'Task b')]
    expect(!(a.dependsOn?.includes(b.id) && b.dependsOn?.includes(a.id))).toBe(true)
  })

  it('moves a dependency earlier when it would come due after the task that needs it', () => {
    const r = normalizeTimeline([item('prep', 10), item('main', 40, { dependsOn: ['prep'] })], '2027-03-01', TODAY)
    expect(byTitle(r.tasks, 'Task prep').dueDate <= byTitle(r.tasks, 'Task main').dueDate).toBe(true)
    expect(r.issues.join(' ')).toMatch(/moved earlier/)
  })

  it('renames duplicate ids instead of losing tasks', () => {
    const r = normalizeTimeline([item('a', 60), item('a', 30)], '2027-03-01', TODAY)
    expect(r.tasks.filter((t) => t.title.startsWith('Task a'))).toHaveLength(2)
    expect(new Set(r.tasks.map((t) => t.id)).size).toBe(r.tasks.length)
  })
})

describe('mergeTimeline', () => {
  const mk = (id: string, title: string, over: Partial<Task> = {}): Task => ({ id, title, dueDate: '2026-12-01', priority: 'medium', done: false, ...over })
  it('keeps done and hand-edited tasks, replaces the rest, skips duplicates', () => {
    const existing = [mk('1', 'Book venue', { done: true }), mk('2', 'My own task', { manual: true }), mk('3', 'Old template task')]
    const generated = [mk('g1', 'Book venue'), mk('g2', 'Order flowers', { dependsOn: ['g1'] })]
    const m = mergeTimeline(existing, generated)
    expect(m.tasks.map((t) => t.title)).toEqual(['Book venue', 'My own task', 'Order flowers'])
    expect(m.kept).toBe(2)
    expect(m.replaced).toBe(1)
    expect(m.tasks.at(-1)!.dependsOn).toEqual([])
  })
})

describe('vendors', () => {
  const req = (title: string, bookByDaysBefore: number, over: Partial<VendorRequirementAI> = {}): VendorRequirementAI => ({
    category: 'venue', title, requirement: 'req', searchCriteria: ['c'], priority: 'medium', bookByDaysBefore, ...over,
  })

  it('computes real book-by dates and sorts by priority', () => {
    const r = normalizeVendors([req('Florist', 40, { category: 'decor' }), req('Venue', 120, { priority: 'book-first' })], '2027-03-01', TODAY)
    expect(r.vendors.map((v) => v.name)).toEqual(['Venue', 'Florist'])
    expect(r.vendors[0]!.bookBy).toBe('2026-11-01')
    expect(r.vendors.every((v) => v.status === 'to-research' && v.quote === null)).toBe(true)
  })

  it('flags booking deadlines that have already passed and moves them to today', () => {
    const r = normalizeVendors([req('Venue', 300)], '2026-12-01', TODAY)
    expect(r.vendors[0]!.bookBy! >= TODAY).toBe(true)
    const near = normalizeVendors([req('Venue', 20), req('Caterer', 10, { category: 'catering' })], '2026-10-25', TODAY)
    expect(near.vendors.every((v) => v.bookBy! >= TODAY && v.bookBy! <= '2026-10-25')).toBe(true)
  })

  it('never invents businesses: only requirements and criteria are produced', () => {
    const r = normalizeVendors([req('Photographer', 90, { category: 'photo' })], '2027-03-01', TODAY)
    expect(r.vendors[0]).toMatchObject({ name: 'Photographer', requirement: 'req', criteria: ['c'] })
    expect(r.vendors[0]!.directoryId).toBeUndefined()
  })

  it('keeps vendors that are in progress and skips duplicates of their category', () => {
    const existing: VendorBooking[] = [
      { id: 'v1', category: 'venue', name: 'Booked hall', status: 'booked', quote: 1, notes: '' },
      { id: 'v2', category: 'decor', name: 'Placeholder', status: 'to-research', quote: null, notes: '' },
    ]
    const generated = normalizeVendors([req('Venue', 90), req('Decor', 60, { category: 'decor' })], '2027-03-01', TODAY).vendors
    const m = mergeVendors(existing, generated)
    expect(m.vendors.map((v) => v.name)).toEqual(['Booked hall', 'Decor'])
    expect(m.kept).toBe(1)
    expect(m.replaced).toBe(1)
  })
})

