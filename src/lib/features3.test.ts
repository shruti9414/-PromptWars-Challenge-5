import { describe, expect, it } from 'vitest'
import { createDemoState } from '../data/demo'
import { AiContextSchema } from '../ai/schema'
import { parseState } from '../state/persistence'
import { reducer } from '../state/reducer'
import type { Task } from '../types'
import { monthMatrix, shiftMonth, tasksByDate } from './calendar'
import { dropDependencyRefs, validateDependencies, wouldCreateCycle } from './dependencies'
import { applyReschedule, planReschedule } from './reschedule'
import { validateDraft, EMPTY_DRAFT } from './validation'

const TODAY = '2026-10-23'
const t = (id: string, dueDate: string, extra: Partial<Task> = {}): Task => ({ id, title: id.toUpperCase(), dueDate, priority: 'medium', done: false, ...extra })

describe('task dependencies', () => {
  const tasks = [t('a', '2026-11-01'), t('b', '2026-11-05', { dependsOn: ['a'] }), t('c', '2026-11-09', { dependsOn: ['b'] })]

  it('detects direct and indirect loops', () => {
    expect(wouldCreateCycle(tasks, 'a', ['c'])).toBe(true)
    expect(wouldCreateCycle(tasks, 'a', ['b'])).toBe(true)
    expect(wouldCreateCycle(tasks, 'c', ['a'])).toBe(false)
  })

  it('rejects self, unknown, looping and later-dated prerequisites with a message', () => {
    expect(validateDependencies(tasks, 'a', '2026-11-01', ['a'])).toMatch(/itself/)
    expect(validateDependencies(tasks, 'a', '2026-11-20', ['zzz'])).toMatch(/no longer exists/)
    expect(validateDependencies(tasks, 'a', '2026-11-20', ['c'])).toMatch(/loop/)
    expect(validateDependencies(tasks, 'new', '2026-11-03', ['b'])).toMatch(/due after this task/)
    expect(validateDependencies(tasks, 'new', '2026-11-10', ['b', 'c'])).toBeUndefined()
    expect(validateDependencies(tasks, 'new', '2026-11-10', [])).toBeUndefined()
  })

  it('removes references to a deleted task without touching others', () => {
    const after = dropDependencyRefs(tasks.filter((x) => x.id !== 'a'), 'a')
    expect(after.find((x) => x.id === 'b')?.dependsOn).toBeUndefined()
    expect(after.find((x) => x.id === 'c')?.dependsOn).toEqual(['b'])
  })
})

describe('planReschedule', () => {
  const tasks = [
    t('far', '2026-12-01'),
    t('mid', '2027-01-01', { manual: true }),
    t('near', '2027-01-20'),
    t('done', '2026-11-01', { done: true }),
  ]

  it('keeps each task its original distance from the event and never moves completed tasks', () => {
    const plan = planReschedule(tasks, '2027-01-25', '2027-02-25', TODAY)
    expect(plan.compressed).toBe(false)
    expect(plan.shifts.map((s) => [s.task.id, s.to])).toEqual([['far', '2027-01-01'], ['mid', '2027-02-01'], ['near', '2027-02-20']])
    expect(plan.shifts.find((s) => s.task.id === 'mid')?.manual).toBe(true)
  })

  it('compresses lead times when the new date is sooner and keeps tasks in order', () => {
    const plan = planReschedule(tasks, '2027-01-25', '2026-11-23', TODAY)
    expect(plan.compressed).toBe(true)
    for (const s of plan.shifts) {
      expect(s.to >= TODAY).toBe(true)
      expect(s.to <= '2026-11-23').toBe(true)
    }
    const order = plan.shifts.map((s) => s.to)
    expect(order).toEqual([...order].sort())
  })

  it('applies only the chosen shifts', () => {
    const plan = planReschedule(tasks, '2027-01-25', '2027-02-25', TODAY)
    const out = applyReschedule(tasks, plan.shifts, new Set(['far']))
    expect(out.find((x) => x.id === 'far')?.dueDate).toBe('2027-01-01')
    expect(out.find((x) => x.id === 'mid')?.dueDate).toBe('2027-01-01')
    expect(applyReschedule(tasks, plan.shifts, new Set())).toEqual(tasks)
  })

  it('returns no shifts when the date is unchanged', () => {
    expect(planReschedule(tasks, '2027-01-25', '2027-01-25', TODAY).shifts).toEqual([])
  })
})

describe('calendar helpers', () => {
  it('builds Monday-first weeks with padding', () => {
    const weeks = monthMatrix(2026, 10) // 1 Oct 2026 is a Thursday
    expect(weeks[0]?.slice(0, 4)).toEqual([null, null, null, '2026-10-01'])
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks.flat().filter(Boolean)).toHaveLength(31)
    expect(monthMatrix(2028, 2).flat().filter(Boolean)).toHaveLength(29)
  })
  it('moves between months across year ends and groups tasks by date', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2027-01', -1)).toBe('2026-12')
    const map = tasksByDate([t('a', '2026-11-01'), t('b', '2026-11-01'), t('c', '2026-11-02')])
    expect(map.get('2026-11-01')).toHaveLength(2)
  })
})

describe('anniversary events', () => {
  it('are accepted by validation, the AI request schema and stored-data checks', () => {
    const draft = { ...EMPTY_DRAFT, type: 'anniversary' as const }
    expect(validateDraft(draft, TODAY, false).type).toBeUndefined()
    expect(AiContextSchema.shape.eventType.safeParse('anniversary').success).toBe(true)
    const state = createDemoState(TODAY)
    const first = state.events[0]!
    const stored = JSON.stringify({ version: 1, ...state, events: [{ ...first, type: 'anniversary' }, ...state.events.slice(1)] })
    expect(parseState(stored)?.events[0]?.type).toBe('anniversary')
  })
})

describe('vendor favourites', () => {
  it('toggles per event and survives a save and load', () => {
    const state = createDemoState(TODAY)
    const id = state.events[0]!.id
    const on = reducer(state, { type: 'vendor/favorite', eventId: id, directoryId: 'dv-venue-1' })
    expect(on.events[0]?.favoriteVendors).toEqual(['dv-venue-1'])
    expect(on.events[1]?.favoriteVendors).toBeUndefined()
    expect(parseState(JSON.stringify({ version: 1, ...on }))?.events[0]?.favoriteVendors).toEqual(['dv-venue-1'])
    expect(reducer(on, { type: 'vendor/favorite', eventId: id, directoryId: 'dv-venue-1' }).events[0]?.favoriteVendors).toEqual([])
  })
  it('drops corrupted favourites instead of the whole event', () => {
    const state = createDemoState(TODAY)
    const bad = JSON.stringify({ version: 1, ...state, events: [{ ...state.events[0], favoriteVendors: [1, 2] }, ...state.events.slice(1)] })
    const parsed = parseState(bad)
    expect(parsed?.events).toHaveLength(state.events.length)
    expect(parsed?.events[0]?.favoriteVendors).toBeUndefined()
  })
})
