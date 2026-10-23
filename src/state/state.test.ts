import { describe, expect, it } from 'vitest'
import { createDemoState } from '../data/demo'
import type { Task } from '../types'
import { isEventPlan, parseState } from './persistence'
import { reducer } from './reducer'

const TODAY = '2026-10-23'
const fresh = () => createDemoState(TODAY)

describe('reducer', () => {
  it('adds an event and makes it active', () => {
    const state = fresh()
    const event = { ...state.events[0]!, id: 'new-1', name: 'New one' }
    const next = reducer(state, { type: 'event/add', event })
    expect(next.events[0]?.id).toBe('new-1')
    expect(next.activeEventId).toBe('new-1')
    expect(next.events).toHaveLength(state.events.length + 1)
  })

  it('updates an event without touching others', () => {
    const state = fresh()
    const next = reducer(state, { type: 'event/update', id: 'demo-birthday', patch: { name: 'Renamed' } })
    expect(next.events.find((e) => e.id === 'demo-birthday')?.name).toBe('Renamed')
    expect(next.events.find((e) => e.id === 'demo-wedding')).toBe(state.events.find((e) => e.id === 'demo-wedding'))
  })

  it('removes an event and falls back to another active event', () => {
    const state = fresh()
    const next = reducer(state, { type: 'event/remove', id: 'demo-wedding' })
    expect(next.events.some((e) => e.id === 'demo-wedding')).toBe(false)
    expect(next.activeEventId).toBe(next.events[0]?.id)
    const empty = [...next.events].reduce((s, e) => reducer(s, { type: 'event/remove', id: e.id }), next)
    expect(empty.activeEventId).toBeNull()
  })

  it('ignores setActive for an unknown id', () => {
    const state = fresh()
    expect(reducer(state, { type: 'event/setActive', id: 'nope' })).toBe(state)
  })

  it('upserts and removes collection items', () => {
    const state = fresh()
    const item: Task = { id: 't-new', title: 'New task', dueDate: '2026-12-01', priority: 'low', done: false }
    const added = reducer(state, { type: 'item/upsert', eventId: 'demo-wedding', collection: 'tasks', item })
    const count = state.events[0]!.tasks.length
    expect(added.events[0]!.tasks).toHaveLength(count + 1)
    const edited = reducer(added, { type: 'item/upsert', eventId: 'demo-wedding', collection: 'tasks', item: { ...item, done: true } })
    expect(edited.events[0]!.tasks).toHaveLength(count + 1)
    expect(edited.events[0]!.tasks.find((t) => t.id === 't-new')?.done).toBe(true)
    const removed = reducer(edited, { type: 'item/remove', eventId: 'demo-wedding', collection: 'tasks', itemId: 't-new' })
    expect(removed.events[0]!.tasks).toHaveLength(count)
  })

  it('toggles saved ideas', () => {
    const state = fresh()
    const on = reducer(state, { type: 'idea/toggle', eventId: 'demo-birthday', ideaId: 'idea-balloon-ceiling' })
    expect(on.events.find((e) => e.id === 'demo-birthday')?.savedIdeas).toContain('idea-balloon-ceiling')
    const off = reducer(on, { type: 'idea/toggle', eventId: 'demo-birthday', ideaId: 'idea-balloon-ceiling' })
    expect(off.events.find((e) => e.id === 'demo-birthday')?.savedIdeas).not.toContain('idea-balloon-ceiling')
  })
})

describe('persistence', () => {
  const serialise = (s: unknown) => JSON.stringify({ version: 1, ...(s as object) })

  it('round-trips the demo state', () => {
    const state = fresh()
    expect(parseState(serialise(state))).toEqual(state)
  })

  it('rejects missing, corrupt or wrong-version data', () => {
    expect(parseState(null)).toBeNull()
    expect(parseState('{not json')).toBeNull()
    expect(parseState(JSON.stringify({ version: 99, events: [] }))).toBeNull()
    expect(parseState(JSON.stringify({ version: 1 }))).toBeNull()
  })

  it('rejects tampered events', () => {
    const state = fresh()
    const bad = { ...state, events: [{ ...state.events[0]!, budget: 'a lot' }] }
    expect(parseState(serialise(bad))).toBeNull()
    const badImg = { ...state, events: [{ ...state.events[0]!, coverImage: 'https://evil.example/x.png' }] }
    expect(parseState(serialise(badImg))).toBeNull()
    expect(isEventPlan({ ...state.events[0]!, tasks: [{ id: 1 }] })).toBe(false)
  })

  it('repairs an unknown active event id', () => {
    const state = fresh()
    const parsed = parseState(serialise({ ...state, activeEventId: 'ghost' }))
    expect(parsed?.activeEventId).toBe(state.events[0]?.id)
  })
})
