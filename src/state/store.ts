import { useSyncExternalStore } from 'react'
import { createDemoState } from '../data/demo'
import { todayISO } from '../lib/dates'
import type { AppState, EventPlan } from '../types'
import { loadState, saveState } from './persistence'
import { reducer } from './reducer'
import type { Action } from './reducer'

let state: AppState = loadState() ?? createDemoState(todayISO())
let saveFailed = false
const listeners = new Set<() => void>()

export const store = {
  getState: (): AppState => state,
  dispatch(action: Action): void {
    const next = reducer(state, action)
    if (next === state) return
    state = next
    saveFailed = !saveState(state)
    listeners.forEach((l) => l())
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  /** Restores the sample events and default settings. */
  resetToDemo(): void {
    store.dispatch({ type: 'state/replace', state: createDemoState(todayISO()) })
  },
  /** Removes every event, keeping settings. */
  clearAll(): void {
    store.dispatch({ type: 'state/replace', state: { ...state, events: [], activeEventId: null } })
  },
}

/**
 * Subscribes a component to a slice of state. The selector must return an existing
 * reference (state.events, a found event ...), never a freshly built array or object.
 */
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(state))
}

/** True when the last save was refused by the browser, so recent changes exist only in this tab. */
export const useSaveFailed = (): boolean => useSyncExternalStore(store.subscribe, () => saveFailed)

export function useActiveEvent(): EventPlan | undefined {
  return useStore((s) => s.events.find((e) => e.id === s.activeEventId))
}

export const useSettings = () => useStore((s) => s.settings)
