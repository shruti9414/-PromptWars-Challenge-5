import { describe, expect, it } from 'vitest'
import { createDemoEvents } from '../data/demo'
import { summarizeBudget } from '../lib/budget'
import type { EventPlan } from '../types'
import { buildAiContext } from './context'
import { demoAssistant, demoFullPlan, demoSection } from './demo'
import { applyProposal, buildProposal, isStale, proposalFromReply, resolveEventChanges, restoreRevision } from './proposal'
import type { BuildOptions } from './proposal'
import type { BudgetLineAI, Patch } from './schema'

const TODAY = '2026-10-23'
const wedding = (): EventPlan => createDemoEvents(TODAY)[0]!
const build = (event: EventPlan, patch: Patch, over: Partial<BuildOptions> = {}) =>
  buildProposal({ event, patch, summary: 'Test proposal', source: 'demo', flexibility: 'moderate', today: TODAY, now: '2026-10-23T10:00:00.000Z', ...over })
const line = (category: BudgetLineAI['category'], estimate: number, essential = false): BudgetLineAI => ({ category, title: category, estimate, rationale: 'r', essential })
const budgetPatch = (lines: BudgetLineAI[]): Patch => ({ budget: { lines, savings: [{ idea: 'Go off-peak', estimatedSaving: 1000 }, { idea: 'Impossible', estimatedSaving: 9e9 }], upgrades: [] } })

describe('resolveEventChanges: arithmetic is done by the app', () => {
  const e = wedding() // 180 guests, 2,800,000
  it('computes a percentage change from the saved budget', () => {
    expect(resolveEventChanges(e, { budgetPercentChange: -15 }).budget).toBe(2_380_000)
    expect(resolveEventChanges(e, { budgetPercentChange: 10 }).budget).toBe(3_080_000)
  })
  it('applies guest deltas and absolute values', () => {
    expect(resolveEventChanges(e, { guestCountDelta: 50 }).guestCount).toBe(230)
    expect(resolveEventChanges(e, { guestCount: 100 }).guestCount).toBe(100)
  })
  it('prefers explicit values and ignores out-of-range or unchanged ones', () => {
    expect(resolveEventChanges(e, { guestCountDelta: -500 }).guestCount).toBeUndefined()
    expect(resolveEventChanges(e, { guestCountDelta: -500 }).issues).toHaveLength(1)
    expect(resolveEventChanges({ ...e, budget: 2000 }, { budgetPercentChange: -90 }).budget).toBeUndefined()
    expect(resolveEventChanges(e, { guestCountDelta: 0 }).guestCount).toBeUndefined()
  })
})

describe('buildProposal: budget', () => {
  it('flags an over-budget proposal, quantifies the gap and offers a plan that fits', () => {
    const e = { ...wedding(), expenses: [], budget: 100_000 }
    const p = build(e, budgetPatch([line('venue', 60_000, true), line('catering', 50_000, true), line('decor', 20_000), line('music', 10_000)]))
    const b = p.budget!
    expect(b.analysisProposed.total).toBeGreaterThan(100_000)
    expect(b.analysisProposed.overBudget).toBe(true)
    expect(p.issues.join(' ')).toMatch(/over by/)
    expect(b.fitted).not.toBeNull()
    expect(b.analysisFitted!.total).toBe(100_000)
    expect(b.analysisFitted!.overBudget).toBe(false)
    expect(b.feasible).toBe(true)
  })

  it('says so when the plan cannot fit at all', () => {
    const e = { ...wedding(), expenses: [], budget: 1000 }
    const p = build(e, budgetPatch([line('venue', 900_000, true), line('catering', 900_000, true), line('decor', 100)]))
    expect(p.budget!.feasible).toBe(false)
    expect(p.issues.join(' ')).toMatch(/Even with maximum sensible trimming/)
  })

  it('adds a contingency reserve sized for the chosen budget style', () => {
    const e = { ...wedding(), expenses: [], budget: 100_000 }
    const strict = build(e, budgetPatch([line('venue', 30_000, true), line('catering', 30_000, true), line('decor', 10_000)]), { flexibility: 'strict' })
    const flexible = build(e, budgetPatch([line('venue', 30_000, true), line('catering', 30_000, true), line('decor', 10_000)]), { flexibility: 'flexible' })
    const reserve = (p: ReturnType<typeof build>) => p.budget!.proposed.find((x) => x.category === 'contingency')!.estimated
    expect(reserve(strict)).toBe(10_000)
    expect(reserve(flexible)).toBe(5_000)
  })

  it('discards impossible savings claims and clearly bad lines', () => {
    const e = { ...wedding(), expenses: [], budget: 100_000 }
    const p = build(e, budgetPatch([line('venue', 30_000, true), line('catering', 30_000, true), line('decor', -4), line('music', 99_000_000)]))
    expect(p.budget!.savings.map((s) => s.idea)).toEqual(['Go off-peak'])
    expect(p.issues.join(' ')).toMatch(/not a valid amount/)
    expect(p.issues.join(' ')).toMatch(/capped/)
  })

  it('keeps paid or hand-edited expenses out of the replacement set', () => {
    const e = wedding()
    const p = build(e, budgetPatch([line('venue', 800_000, true), line('catering', 700_000, true), line('decor', 200_000)]))
    const paid = e.expenses.filter((x) => x.paid || x.actual !== null)
    expect(p.budget!.kept.map((x) => x.id).sort()).toEqual(paid.map((x) => x.id).sort())
  })

  it('computes cost per guest with the new guest count', () => {
    const e = { ...wedding(), expenses: [] }
    const p = build(e, { ...budgetPatch([line('venue', 50_000, true), line('catering', 50_000, true), line('decor', 20_000)]) }, { eventChanges: { guestCount: 100 } })
    expect(p.budget!.analysisProposed.perGuest).toBe(Math.round(p.budget!.analysisProposed.total / 100))
  })
})

describe('buildProposal: event changes without a model-supplied budget', () => {
  it('"reduce my budget by 15%" lowers the total and rebalances open lines to fit', () => {
    const e = wedding()
    const p = build(e, {}, { eventChanges: { budgetPercentChange: -15 }, rebalanceBudget: true, summary: 'Lower the total budget by 15%' })
    expect(p.eventChanges.budget).toEqual({ from: 2_800_000, to: 2_380_000 })
    expect(p.budget).toBeDefined()
    const after = summarizeBudget(2_380_000, p.budget!.proposed)
    expect(after.overBudget).toBe(false)
    // Paid / billed lines are untouched.
    for (const x of e.expenses.filter((y) => y.paid || y.actual !== null)) expect(p.budget!.proposed.find((y) => y.id === x.id)).toEqual(x)
  })

  it('extra guests scale catering and favours and warn about billed vendors', () => {
    const e = wedding()
    const p = build(e, {}, { eventChanges: { guestCountDelta: 50 }, rebalanceBudget: false })
    expect(p.eventChanges.guestCount).toEqual({ from: 180, to: 230 })
    const cat = p.budget!.proposed.find((x) => x.category === 'catering')!
    expect(cat.estimated).toBe(e.expenses.find((x) => x.category === 'catering')!.estimated) // billed by the user, so not rescaled
    expect(p.issues.join(' ')).toMatch(/not rescaled/)
    const fav = p.budget!.proposed.find((x) => x.category === 'favors')!
    expect(fav.estimated).toBe(Math.round(40_000 * (230 / 180)))
  })

  it('reports being over budget after a headcount increase', () => {
    const open = (id: string, category: 'venue' | 'catering', estimated: number) => ({ id, title: id, category, estimated, actual: null, paid: false })
    const e = { ...wedding(), guestCount: 100, budget: 2_100_000, expenses: [open('hall', 'venue', 1_000_000), open('food', 'catering', 1_000_000)] }
    const p = build(e, {}, { eventChanges: { guestCountDelta: 100 }, rebalanceBudget: false })
    expect(p.issues.join(' ')).toMatch(/over budget by/)
  })
})

describe('buildProposal: timeline, vendors and narrative', () => {
  it('turns timeline items into dated tasks, keeping finished ones', () => {
    const e = wedding()
    const patch = demoSection('timeline', buildAiContext(e, 'INR', 'moderate'), TODAY)
    const p = build(e, patch)
    expect(p.timeline!.kept).toBe(e.tasks.filter((t) => t.done).length)
    expect(p.timeline!.tasks.every((t) => t.dueDate >= '2026-10-23' || t.done)).toBe(true)
    expect(p.touches).toContain('Timeline')
  })

  it('flags an impossible schedule for a soon-to-happen event', () => {
    const e = { ...wedding(), date: '2026-10-28' }
    const full = demoFullPlan({ ...buildAiContext(e, 'INR', 'moderate') }, TODAY)
    full.timeline = full.timeline.map((t, i) => ({ ...t, daysBeforeEvent: 200 - i }))
    const p = build(e, { timeline: full.timeline })
    expect(p.issues.join(' ')).toMatch(/compressed/i)
    expect(p.timeline!.compressed).toBe(true)
  })

  it('carries ideas, risks and assumptions through for display', () => {
    const e = wedding()
    const p = build(e, demoFullPlan(buildAiContext(e, 'INR', 'moderate'), TODAY))
    expect(p.touches).toEqual(expect.arrayContaining(['Budget', 'Timeline', 'Vendor checklist', 'Concept & theme', 'Ideas', 'Risks & backups']))
    expect(p.plan.assumptions!.join(' ')).toMatch(/estimates/)
  })
})

describe('applying and restoring', () => {
  it('does not change the event until applyProposal is called', () => {
    const e = wedding()
    const before = JSON.stringify(e)
    build(e, demoFullPlan(buildAiContext(e, 'INR', 'moderate'), TODAY))
    expect(JSON.stringify(e)).toBe(before)
  })

  it('applies changes, records a revision and keeps protected data', () => {
    const e = wedding()
    const p = build(e, demoFullPlan(buildAiContext(e, 'INR', 'moderate'), TODAY))
    const next = applyProposal(e, p, 'fitted', '2026-10-23T10:00:00.000Z')
    expect(next.revisions).toHaveLength(1)
    expect(next.aiPlan).toMatchObject({ source: 'demo', flexibility: 'moderate' })
    expect(next.aiPlan!.overview).toBeDefined()
    for (const x of e.expenses.filter((y) => y.paid)) expect(next.expenses.find((y) => y.id === x.id)).toEqual(x)
    for (const t of e.tasks.filter((y) => y.done)) expect(next.tasks.find((y) => y.id === t.id)).toEqual(t)
    for (const v of e.vendors.filter((y) => y.status === 'booked')) expect(next.vendors.find((y) => y.id === v.id)).toEqual(v)
    expect(next.name).toBe(e.name)
    expect(next.guests).toBe(e.guests)
  })

  it('uses the trimmed budget variant when asked and the proposed one otherwise', () => {
    const e = { ...wedding(), expenses: [], budget: 100_000 }
    const p = build(e, budgetPatch([line('venue', 60_000, true), line('catering', 50_000, true), line('decor', 20_000)]))
    const fitted = applyProposal(e, p, 'fitted')
    const asProposed = applyProposal(e, p, 'proposed')
    const sum = (x: EventPlan) => x.expenses.reduce((a, y) => a + y.estimated, 0)
    expect(sum(fitted)).toBe(100_000)
    expect(sum(asProposed)).toBeGreaterThan(100_000)
  })

  it('applies guest and budget changes to the event', () => {
    const e = wedding()
    const p = build(e, {}, { eventChanges: { guestCountDelta: 20, budgetPercentChange: -10 }, rebalanceBudget: true })
    const next = applyProposal(e, p)
    expect(next.guestCount).toBe(200)
    expect(next.budget).toBe(2_520_000)
  })

  it('restores the exact previous state from a revision', () => {
    const e = wedding()
    const next = applyProposal(e, build(e, demoFullPlan(buildAiContext(e, 'INR', 'moderate'), TODAY)))
    const back = restoreRevision(next, next.revisions![0]!.id)
    expect(back.expenses).toEqual(e.expenses)
    expect(back.tasks).toEqual(e.tasks)
    expect(back.vendors).toEqual(e.vendors)
    expect(back.aiPlan).toBeUndefined()
    expect(back.revisions).toEqual([])
    expect(restoreRevision(next, 'missing')).toBe(next)
  })

  it('keeps at most eight revisions', () => {
    let e = wedding()
    for (let i = 0; i < 10; i++) e = applyProposal(e, build(e, demoSection('ideas', buildAiContext(e, 'INR', 'moderate'), TODAY)))
    expect(e.revisions).toHaveLength(8)
  })

  it('detects a stale proposal after the user edits the event', () => {
    const e = wedding()
    const p = build(e, demoSection('timeline', buildAiContext(e, 'INR', 'moderate'), TODAY))
    expect(isStale(e, p)).toBe(false)
    expect(isStale({ ...e, tasks: [...e.tasks] }, p)).toBe(true)
  })
})

describe('assistant replies become proposals', () => {
  const ctx = (e: EventPlan) => buildAiContext(e, 'INR', 'moderate')
  it('returns null for a plain answer with no proposal', () => {
    const e = wedding()
    const reply = demoAssistant('Explain why the venue is necessary', ctx(e), { expenses: [{ title: 'Venue', category: 'venue', estimated: 1000, billed: null, locked: false }], tasks: [], vendors: [] }, TODAY)
    expect(reply.reply).toMatch(/estimate, not a quotation/)
    expect(proposalFromReply(e, reply, 'demo', undefined, 'moderate', TODAY)).toBeNull()
  })
  it('builds a reviewable proposal for budget reductions', () => {
    const e = wedding()
    const reply = demoAssistant('Reduce my wedding budget by 15%', ctx(e), { expenses: [], tasks: [], vendors: [] }, TODAY)
    const p = proposalFromReply(e, reply, 'demo', undefined, 'moderate', TODAY)!
    expect(p.eventChanges.budget?.to).toBe(2_380_000)
  })
})

