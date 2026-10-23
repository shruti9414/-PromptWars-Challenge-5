import { applyProposal, isStale, restoreRevision } from '../../ai/proposal'
import type { BudgetVariant, Proposal } from '../../ai/proposal'
import { store } from '../../state/store'

/** Applies a proposal the user has already reviewed and confirmed. A restorable snapshot is kept. */
/** Returns false (and changes nothing) if the event was edited after the proposal was built. */
export function applyReviewedProposal(eventId: string, proposal: Proposal, variant: BudgetVariant): boolean {
  const event = store.getState().events.find((e) => e.id === eventId)
  if (!event || isStale(event, proposal)) return false
  const next = applyProposal(event, proposal, variant)
  store.dispatch({
    type: 'event/update',
    id: eventId,
    patch: {
      guestCount: next.guestCount, budget: next.budget, expenses: next.expenses, tasks: next.tasks,
      vendors: next.vendors, aiPlan: next.aiPlan, revisions: next.revisions,
    },
  })
  return true
}

export function restoreEventRevision(eventId: string, revisionId: string): void {
  const event = store.getState().events.find((e) => e.id === eventId)
  if (!event) return
  const next = restoreRevision(event, revisionId)
  store.dispatch({
    type: 'event/update',
    id: eventId,
    patch: { guestCount: next.guestCount, budget: next.budget, expenses: next.expenses, tasks: next.tasks, vendors: next.vendors, aiPlan: next.aiPlan, revisions: next.revisions },
  })
}

