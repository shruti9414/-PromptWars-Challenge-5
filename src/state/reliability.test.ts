import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoState } from '../data/demo'
import { dismissLoadNotice, getLoadNotice, loadState, parseStateDetailed, saveState } from './persistence'
import { store, useSaveFailed } from './store'

const TODAY = '2026-10-23'
const STATE_KEY = 'gatherly.v1.state'
const BACKUP_KEY = 'gatherly.v1.state-backup'
const stored = (over: object = {}, events = createDemoState(TODAY).events) => JSON.stringify({ version: 1, ...createDemoState(TODAY), events, ...over })

afterEach(() => {
  vi.restoreAllMocks()
  dismissLoadNotice()
  localStorage.clear()
})

describe('reading damaged storage', () => {
  it('skips one corrupted event and keeps every other event', () => {
    const events = createDemoState(TODAY).events
    const bad = [events[0]!, { ...events[1]!, budget: 'lots' }, events[2]!]
    const r = parseStateDetailed(stored({}, bad as never))
    expect(r.dropped).toBe(1)
    expect(r.state?.events.map((e) => e.id)).toEqual([events[0]!.id, events[2]!.id])
  })

  it('drops events with a repeated id and keeps the first', () => {
    const events = createDemoState(TODAY).events
    const r = parseStateDetailed(stored({}, [events[0]!, { ...events[0]!, name: 'Copy' }]))
    expect(r.state?.events).toHaveLength(1)
    expect(r.state?.events[0]?.name).toBe(events[0]!.name)
    expect(r.dropped).toBe(1)
  })

  it('falls back to default settings without losing events', () => {
    const r = parseStateDetailed(stored({ settings: { currency: 'DOGE' } }))
    expect(r.state?.settings).toEqual({ currency: 'INR', displayName: '', reduceMotion: false })
    expect(r.state?.events).toHaveLength(3)
    expect(parseStateDetailed(stored({ settings: null })).state?.events).toHaveLength(3)
  })

  it('treats a missing, unparsable or wrong-shaped blob as no data, without throwing', () => {
    for (const raw of [null, '', '{', 'null', '[]', '"x"', JSON.stringify({ version: 1, events: 'no' }), JSON.stringify({ version: 2, events: [] })]) {
      expect(parseStateDetailed(raw).state).toBeNull()
    }
  })

  it('repairs an active event id that no longer exists', () => {
    expect(parseStateDetailed(stored({ activeEventId: 'ghost' })).state?.activeEventId).toBe(createDemoState(TODAY).events[0]!.id)
  })
})

describe('loadState safety net', () => {
  it('keeps a backup copy and explains what happened when some events are unreadable', () => {
    const events = createDemoState(TODAY).events
    const raw = stored({}, [events[0]!, { id: 5 }] as never)
    localStorage.setItem(STATE_KEY, raw)
    const state = loadState()
    expect(state?.events).toHaveLength(1)
    expect(localStorage.getItem(BACKUP_KEY)).toBe(raw)
    expect(getLoadNotice()).toMatch(/1 saved event could not be read/)
    dismissLoadNotice()
    expect(getLoadNotice()).toBeNull()
  })

  it('backs up and reports completely unreadable data, and never overwrites an earlier backup', () => {
    localStorage.setItem(STATE_KEY, '{broken')
    expect(loadState()).toBeNull()
    expect(localStorage.getItem(BACKUP_KEY)).toBe('{broken')
    expect(getLoadNotice()).toMatch(/could not be read/)
    localStorage.setItem(STATE_KEY, '{second}')
    loadState()
    expect(localStorage.getItem(BACKUP_KEY)).toBe('{broken')
  })

  it('does not create a backup or a notice for healthy data or an empty store', () => {
    expect(loadState()).toBeNull()
    localStorage.setItem(STATE_KEY, stored())
    expect(loadState()?.events).toHaveLength(3)
    expect(localStorage.getItem(BACKUP_KEY)).toBeNull()
    expect(getLoadNotice()).toBeNull()
  })

  it('survives storage that throws on read, write or backup', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(loadState()).toBeNull()
    vi.restoreAllMocks()
    localStorage.setItem(STATE_KEY, '{broken')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    expect(() => loadState()).not.toThrow()
  })
})

describe('saving', () => {
  it('reports success and failure instead of throwing', () => {
    expect(saveState(createDemoState(TODAY))).toBe(true)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
    expect(saveState(createDemoState(TODAY))).toBe(false)
  })

  it('flags a failed save in the store and clears the flag once saving works again', () => {
    store.dispatch({ type: 'state/replace', state: createDemoState(TODAY) })
    const { result } = renderHook(() => useSaveFailed())
    expect(result.current).toBe(false)
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    act(() => store.dispatch({ type: 'event/update', id: 'demo-wedding', patch: { name: 'Changed once' } }))
    expect(result.current).toBe(true)
    // The change is still applied in memory.
    expect(store.getState().events.find((e) => e.id === 'demo-wedding')?.name).toBe('Changed once')
    spy.mockRestore()
    act(() => store.dispatch({ type: 'event/update', id: 'demo-wedding', patch: { name: 'Changed twice' } }))
    expect(result.current).toBe(false)
  })

  it('round-trips through storage after delete and reset so the UI and storage agree', () => {
    store.dispatch({ type: 'state/replace', state: createDemoState(TODAY) })
    act(() => store.dispatch({ type: 'event/remove', id: 'demo-birthday' }))
    expect(parseStateDetailed(localStorage.getItem(STATE_KEY)).state?.events.map((e) => e.id)).not.toContain('demo-birthday')
    act(() => store.clearAll())
    expect(parseStateDetailed(localStorage.getItem(STATE_KEY)).state?.events).toEqual([])
    act(() => store.resetToDemo())
    expect(parseStateDetailed(localStorage.getItem(STATE_KEY)).state?.events).toHaveLength(3)
  })
})
