import { THEMES } from '../data/constants'
import { cleanText } from '../lib/validation'
import type { Currency, EventPlan } from '../types'
import type { AiContext, CurrentSnapshot } from './schema'

export type Flexibility = AiContext['flexibility']

/** An item the user added or edited, or that already represents progress, is never replaced by a regenerated plan. */
export const isProtectedExpense = (e: EventPlan['expenses'][number]) => Boolean(e.manual) || e.paid || e.actual !== null
export const isProtectedTask = (t: EventPlan['tasks'][number]) => Boolean(t.manual) || t.done
export const isProtectedVendor = (v: EventPlan['vendors'][number]) => Boolean(v.manual) || v.status !== 'to-research'

/**
 * Builds the only data sent to the AI provider. The event name, notes, guest names and
 * vendor contact details are intentionally left out.
 */
export function buildAiContext(
  event: EventPlan,
  currency: Currency,
  flexibility: Flexibility,
  instructions?: string,
): AiContext {
  const theme = THEMES.find((t) => t.id === event.theme)?.label ?? event.theme
  const clean = instructions ? cleanText(instructions).slice(0, 400) : ''
  return {
    eventType: event.type,
    date: event.date,
    location: cleanText(event.location).slice(0, 100),
    guestCount: event.guestCount,
    budget: event.budget,
    currency,
    theme: cleanText(theme).slice(0, 60) || 'Custom',
    preferences: event.preferences.slice(0, 14),
    venueStatus: event.venueStatus ?? 'not-started',
    priorities: (event.priorities ?? []).slice(0, 8),
    flexibility,
    ...(clean ? { instructions: clean } : {}),
  }
}

const clip = (s: string, n: number) => cleanText(s).slice(0, n) || 'Untitled'

export function buildSnapshot(event: EventPlan): CurrentSnapshot {
  return {
    expenses: event.expenses.slice(0, 30).map((e) => ({
      title: clip(e.title, 80), category: e.category, estimated: e.estimated, billed: e.actual, locked: isProtectedExpense(e),
    })),
    tasks: event.tasks.slice(0, 40).map((t) => ({ title: clip(t.title, 100), dueDate: t.dueDate, done: t.done, locked: isProtectedTask(t) })),
    vendors: event.vendors.slice(0, 20).map((v) => ({ title: clip(v.name, 80), category: v.category, status: v.status, locked: isProtectedVendor(v) })),
  }
}
