import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { App } from '../App'
import { createDemoState } from '../data/demo'
import { clearDraft } from '../state/persistence'
import { store } from '../state/store'

export const TODAY = '2026-10-23'

/** Freezes "today", resets the store to the sample events and renders the whole app at `hash`. */
export function renderApp(hash: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 23, 10, 0, 0))
  clearDraft()
  store.dispatch({ type: 'state/replace', state: createDemoState(TODAY) })
  window.location.hash = hash
  return render(<App />)
}
