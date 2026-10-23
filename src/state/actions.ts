import { coverFor } from '../data/constants'
import { todayISO } from '../lib/dates'
import { newId } from '../lib/format'
import { templatePlanner } from '../lib/planner'
import type { EventInput, EventPlan } from '../types'
import { store } from './store'

/** Builds a new event (optionally with a rule-based starter plan) and makes it the active one. */
export function createEvent(input: EventInput, withSuggestedPlan: boolean): EventPlan {
  const today = todayISO()
  const plan = withSuggestedPlan ? templatePlanner.generate(input, today) : { expenses: [], tasks: [], vendors: [] }
  const event: EventPlan = {
    ...input,
    id: newId(),
    coverImage: coverFor(input.type),
    isDemo: false,
    createdAt: today,
    ...plan,
    guests: [],
    savedIdeas: [],
  }
  store.dispatch({ type: 'event/add', event })
  return event
}

export function updateEvent(id: string, input: EventInput): void {
  const existing = store.getState().events.find((e) => e.id === id)
  if (!existing) return
  // Changing the event type changes the cover photo, but only for events that still use the default one.
  const coverImage = existing.type === input.type ? existing.coverImage : coverFor(input.type)
  store.dispatch({ type: 'event/update', id, patch: { ...input, coverImage } })
}
