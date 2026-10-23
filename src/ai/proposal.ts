import { THEMES } from '../data/constants'
import { newId } from '../lib/format'
import type { EventPlan, Expense, Task, VendorBooking } from '../types'
import { analyzeBudget, ensureContingency, mergeBudget, rebalanceExpenses, sanitizeLines, scaleForGuests } from './budget'
import type { BudgetAnalysis } from './budget'
import type { Flexibility } from './context'
import { mergeTimeline, mergeVendors, normalizeTimeline, normalizeVendors } from './timeline'
import type { AssistantReply, EventChanges, Patch, PlanRevision, Source, StoredAiPlan } from './schema'

export type BudgetVariant = 'proposed' | 'fitted'

export interface BudgetProposal {
  kept: Expense[]
  proposed: Expense[]
  fitted: Expense[] | null
  feasible: boolean
  analysisProposed: BudgetAnalysis
  analysisFitted: BudgetAnalysis | null
  savings: { idea: string; estimatedSaving: number }[]
  upgrades: string[]
  lines: { title: string; rationale: string; essential: boolean }[]
  replaced: number
}

export interface Proposal {
  id: string
  source: Source
  model?: string
  generatedAt: string
  summary: string
  flexibility: Flexibility
  eventChanges: { guestCount?: { from: number; to: number }; budget?: { from: number; to: number } }
  budget?: BudgetProposal
  timeline?: { tasks: Task[]; kept: number; replaced: number; compressed: boolean }
  vendors?: { vendors: VendorBooking[]; kept: number; replaced: number }
  plan: Partial<Pick<StoredAiPlan, 'overview' | 'recommendations' | 'risks' | 'assumptions' | 'followUpQuestions'>>
  /** Everything the application adjusted, flagged or could not honour. Shown to the user before they apply. */
  issues: string[]
  /** Section names that will change, for the confirmation dialog. */
  touches: string[]
  /** The event arrays this proposal was built from. If they have since changed the proposal is stale. */
  base: Pick<EventPlan, 'expenses' | 'tasks' | 'vendors'>
}

/** True when the event was edited after the proposal was built, so applying it could overwrite newer work. */
export function isStale(event: EventPlan, p: Proposal): boolean {
  return event.expenses !== p.base.expenses || event.tasks !== p.base.tasks || event.vendors !== p.base.vendors
}

export interface BuildOptions {
  event: EventPlan
  patch: Patch
  eventChanges?: EventChanges
  rebalanceBudget?: boolean
  summary: string
  source: Source
  model?: string
  flexibility: Flexibility
  today: string
  now?: string
}

/** Resolves model-requested event changes using application arithmetic only. */
export function resolveEventChanges(event: EventPlan, changes: EventChanges | undefined): { guestCount?: number; budget?: number; issues: string[] } {
  const issues: string[] = []
  if (!changes) return { issues }
  const out: { guestCount?: number; budget?: number } = {}
  if (changes.guestCount !== undefined) out.guestCount = changes.guestCount
  else if (changes.guestCountDelta !== undefined) out.guestCount = event.guestCount + changes.guestCountDelta
  if (changes.budget !== undefined) out.budget = changes.budget
  else if (changes.budgetPercentChange !== undefined) out.budget = Math.round(event.budget * (1 + changes.budgetPercentChange / 100))
  if (out.guestCount !== undefined && (out.guestCount < 1 || out.guestCount > 5000)) {
    issues.push('The requested guest count is outside 1 to 5000, so it was ignored.')
    delete out.guestCount
  }
  if (out.budget !== undefined && (out.budget < 1000 || out.budget > 1_000_000_000)) {
    issues.push('The requested budget is outside the supported range, so it was ignored.')
    delete out.budget
  }
  if (out.guestCount === event.guestCount) delete out.guestCount
  if (out.budget === event.budget) delete out.budget
  return { ...out, issues }
}

/**
 * Turns an AI patch into a reviewable proposal. This is where every number and date is checked or
 * recomputed by application code. Nothing here changes the stored event.
 */
export function buildProposal(o: BuildOptions): Proposal {
  const { event, patch, flexibility, today } = o
  const issues: string[] = []
  const touches: string[] = []

  const resolved = resolveEventChanges(event, o.eventChanges)
  issues.push(...resolved.issues)
  const guests = resolved.guestCount ?? event.guestCount
  const budgetTotal = resolved.budget ?? event.budget
  const eventChanges: Proposal['eventChanges'] = {}
  if (resolved.guestCount !== undefined) {
    eventChanges.guestCount = { from: event.guestCount, to: resolved.guestCount }
    touches.push('Guest count')
  }
  if (resolved.budget !== undefined) {
    eventChanges.budget = { from: event.budget, to: resolved.budget }
    touches.push('Total budget')
  }

  let budget: BudgetProposal | undefined
  if (patch.budget) {
    const clean = sanitizeLines(patch.budget.lines, budgetTotal)
    issues.push(...clean.issues)
    const withReserve = ensureContingency(clean.lines, budgetTotal, flexibility)
    const merged = mergeBudget(event.expenses, withReserve, budgetTotal)
    issues.push(...merged.issues)
    const analysisProposed = analyzeBudget([...merged.kept, ...merged.proposed], budgetTotal, guests)
    const analysisFitted = merged.fitted ? analyzeBudget([...merged.kept, ...merged.fitted], budgetTotal, guests) : null
    if (analysisProposed.overBudget)
      issues.push(
        merged.feasible
          ? `The proposed budget is over by ${analysisProposed.overBy.toLocaleString('en-US')}. A trimmed version that fits is available.`
          : `Even with maximum sensible trimming the plan is over budget by ${(analysisFitted?.overBy ?? analysisProposed.overBy).toLocaleString('en-US')}. Raise the budget, reduce guests or choose cheaper options.`,
      )
    // Savings the model claims can never exceed what is actually being spent.
    const savings = patch.budget.savings.filter((s) => s.estimatedSaving <= analysisProposed.total).map((s) => ({ ...s, estimatedSaving: Math.round(s.estimatedSaving) }))
    budget = {
      ...merged,
      analysisProposed,
      analysisFitted,
      savings,
      upgrades: patch.budget.upgrades,
      lines: withReserve.map((l) => ({ title: l.title, rationale: l.rationale, essential: l.essential })),
      replaced: event.expenses.length - merged.kept.length,
    }
    touches.push('Budget')
  } else if (resolved.guestCount !== undefined || resolved.budget !== undefined) {
    // Rebalance existing lines for new headcount / budget with arithmetic only.
    let expenses = event.expenses
    if (resolved.guestCount !== undefined) {
      const scaled = scaleForGuests(expenses, event.guestCount, resolved.guestCount)
      expenses = scaled.expenses
      for (const s of scaled.skipped) issues.push(`"${s.title}" is already billed or edited by you, so it was not rescaled. Confirm the new headcount with that vendor.`)
    }
    if (o.rebalanceBudget !== false) {
      const re = rebalanceExpenses(expenses, budgetTotal)
      expenses = re.expenses
      if (!re.feasible) issues.push('Your costs cannot be trimmed enough to fit the new budget. Review the highest lines manually.')
    }
    const changed = expenses.filter((e, i) => e !== event.expenses[i])
    if (changed.length > 0) {
      const analysis = analyzeBudget(expenses, budgetTotal, guests)
      if (analysis.overBudget) issues.push(`After the change you would be over budget by ${analysis.overBy.toLocaleString('en-US')}.`)
      budget = {
        kept: [], proposed: expenses, fitted: null, feasible: !analysis.overBudget, analysisProposed: analysis, analysisFitted: null,
        savings: [], upgrades: [], lines: [], replaced: 0,
      }
      touches.push('Budget lines')
    }
  }

  let timeline: Proposal['timeline']
  if (patch.timeline && patch.timeline.length > 0) {
    const norm = normalizeTimeline(patch.timeline, event.date, today)
    issues.push(...norm.issues)
    if (norm.tasks.length > 0) {
      const merged = mergeTimeline(event.tasks, norm.tasks)
      issues.push(...merged.issues)
      timeline = { tasks: merged.tasks, kept: merged.kept, replaced: merged.replaced, compressed: norm.compressed }
      touches.push('Timeline')
    }
  }

  let vendors: Proposal['vendors']
  if (patch.vendors && patch.vendors.length > 0) {
    const norm = normalizeVendors(patch.vendors, event.date, today)
    issues.push(...norm.issues)
    const merged = mergeVendors(event.vendors, norm.vendors)
    issues.push(...merged.issues)
    vendors = { vendors: merged.vendors, kept: merged.kept, replaced: merged.replaced }
    touches.push('Vendor checklist')
  }

  const plan: Proposal['plan'] = {}
  if (patch.overview) { plan.overview = patch.overview; touches.push('Concept & theme') }
  if (patch.recommendations) { plan.recommendations = patch.recommendations; touches.push('Ideas') }
  if (patch.risks) { plan.risks = patch.risks; touches.push('Risks & backups') }
  if (patch.assumptions) plan.assumptions = patch.assumptions
  if (patch.followUpQuestions) plan.followUpQuestions = patch.followUpQuestions

  return {
    id: newId(),
    source: o.source,
    model: o.model,
    generatedAt: o.now ?? new Date().toISOString(),
    summary: o.summary,
    flexibility,
    eventChanges,
    budget,
    timeline,
    vendors,
    plan,
    issues: [...new Set(issues)],
    touches: [...new Set(touches)],
    base: { expenses: event.expenses, tasks: event.tasks, vendors: event.vendors },
  }
}

export function proposalIsEmpty(p: Proposal): boolean {
  return p.touches.length === 0
}

/** Adapts an assistant reply into the same Proposal the section regenerators produce. */
export function proposalFromReply(event: EventPlan, reply: AssistantReply, source: Source, model: string | undefined, flexibility: Flexibility, today: string): Proposal | null {
  const prop = reply.proposal
  if (!prop) return null
  const p = buildProposal({
    event, patch: prop.patch ?? {}, eventChanges: prop.eventChanges, rebalanceBudget: prop.rebalanceBudget,
    summary: prop.summary, source, model, flexibility, today,
  })
  return proposalIsEmpty(p) ? null : p
}

const MAX_REVISIONS = 8

/**
 * Applies a reviewed proposal and records a restorable snapshot of what it replaced.
 * Callers must only invoke this after the user confirmed the preview.
 */
export function applyProposal(event: EventPlan, p: Proposal, variant: BudgetVariant = 'fitted', now: string = new Date().toISOString()): EventPlan {
  const snapshot: PlanRevision['snapshot'] = {
    guestCount: event.guestCount,
    budget: event.budget,
    expenses: event.expenses,
    tasks: event.tasks,
    vendors: event.vendors,
    aiPlan: event.aiPlan,
  }
  const revision: PlanRevision = { id: newId(), createdAt: now, label: p.summary.slice(0, 200), source: p.source, snapshot }

  let expenses = event.expenses
  if (p.budget) {
    const useFit = variant === 'fitted' && p.budget.fitted !== null
    expenses = [...p.budget.kept, ...(useFit ? p.budget.fitted! : p.budget.proposed)]
  }

  const prev = event.aiPlan
  const aiPlan: StoredAiPlan = {
    ...prev,
    ...p.plan,
    ...(p.budget ? { savings: p.budget.savings, upgrades: p.budget.upgrades } : {}),
    source: p.source,
    generatedAt: p.generatedAt,
    flexibility: p.flexibility,
    issues: p.issues.slice(0, 20).map((i) => i.slice(0, 300)),
  }
  if (p.model) aiPlan.model = p.model
  else delete aiPlan.model

  return {
    ...event,
    guestCount: p.eventChanges.guestCount?.to ?? event.guestCount,
    budget: p.eventChanges.budget?.to ?? event.budget,
    expenses,
    tasks: p.timeline ? p.timeline.tasks : event.tasks,
    vendors: p.vendors ? p.vendors.vendors : event.vendors,
    aiPlan,
    revisions: [revision, ...(event.revisions ?? [])].slice(0, MAX_REVISIONS),
  }
}

/** Restores the state captured before a revision was applied. The restored revision and newer ones are dropped. */
export function restoreRevision(event: EventPlan, revisionId: string): EventPlan {
  const list = event.revisions ?? []
  const index = list.findIndex((r) => r.id === revisionId)
  if (index < 0) return event
  const snap = list[index]!.snapshot
  const next: EventPlan = {
    ...event,
    guestCount: snap.guestCount,
    budget: snap.budget,
    expenses: snap.expenses as Expense[],
    tasks: snap.tasks as Task[],
    vendors: snap.vendors as VendorBooking[],
    revisions: list.slice(index + 1),
  }
  if (snap.aiPlan) next.aiPlan = snap.aiPlan
  else delete next.aiPlan
  return next
}

export function themeLabel(id: string): string {
  return THEMES.find((t) => t.id === id)?.label ?? id
}

