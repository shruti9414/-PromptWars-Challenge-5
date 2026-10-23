import { describe, expect, it } from 'vitest'
import type { Expense } from '../types'
import {
  CONTINGENCY_MIN,
  analyzeBudget,
  ensureContingency,
  fitToBudget,
  mergeBudget,
  rebalanceExpenses,
  sanitizeLines,
  scaleForGuests,
} from './budget'
import type { CleanLine } from './budget'
import type { BudgetLineAI } from './schema'

const line = (category: CleanLine['category'], estimate: number, essential = false, title = category as string): CleanLine => ({ category, title, estimate, rationale: 'r', essential })
const ai = (category: BudgetLineAI['category'], estimate: number, title = category as string): BudgetLineAI => ({ category, title, estimate, rationale: 'r', essential: false })
const exp = (id: string, category: Expense['category'], estimated: number, over: Partial<Expense> = {}): Expense => ({ id, title: id, category, estimated, actual: null, paid: false, ...over })
const total = (l: { estimate: number }[]) => l.reduce((a, x) => a + x.estimate, 0)

describe('sanitizeLines: never trust model numbers', () => {
  it('drops negative and non-finite estimates and reports them', () => {
    const r = sanitizeLines([ai('venue', -5), ai('catering', Number.NaN), ai('decor', 1000)], 100_000)
    expect(r.lines.map((l) => l.category)).toEqual(['decor'])
    expect(r.issues).toHaveLength(2)
  })
  it('caps absurd estimates at the budget and rounds to whole units', () => {
    const r = sanitizeLines([ai('venue', 9_000_000), ai('catering', 1234.56)], 100_000)
    expect(r.lines[0]!.estimate).toBe(100_000)
    expect(r.lines[1]!.estimate).toBe(1235)
    expect(r.issues[0]).toMatch(/capped/)
  })
  it('merges duplicate category+title lines', () => {
    const r = sanitizeLines([ai('decor', 100, 'Flowers'), ai('decor', 50, 'flowers')], 10_000)
    expect(r.lines).toEqual([expect.objectContaining({ estimate: 150 })])
  })
})

describe('ensureContingency', () => {
  it.each(['strict', 'moderate', 'flexible'] as const)('adds a %s reserve when missing', (flex) => {
    const out = ensureContingency([line('venue', 100)], 10_000, flex)
    const reserve = out.find((l) => l.category === 'contingency')!
    expect(reserve.estimate).toBe(Math.round(10_000 * CONTINGENCY_MIN[flex]))
    expect(reserve.essential).toBe(true)
  })
  it('raises a too-small reserve but never lowers a bigger one', () => {
    expect(ensureContingency([line('contingency', 10)], 10_000, 'strict')[0]!.estimate).toBe(1000)
    expect(ensureContingency([line('contingency', 5000)], 10_000, 'strict')[0]!.estimate).toBe(5000)
  })
  it('a strict budget keeps a larger reserve than a flexible one', () => {
    expect(CONTINGENCY_MIN.strict).toBeGreaterThan(CONTINGENCY_MIN.moderate)
    expect(CONTINGENCY_MIN.moderate).toBeGreaterThan(CONTINGENCY_MIN.flexible)
  })
})

describe('fitToBudget', () => {
  const lines = [line('venue', 400, true), line('catering', 400, true), line('decor', 200), line('favors', 100)]

  it('returns lines unchanged when they already fit', () => {
    const r = fitToBudget(lines, 2000)
    expect(r.feasible).toBe(true)
    expect(total(r.lines)).toBe(1100)
  })

  it('trims optional lines first and lands exactly on the budget', () => {
    const r = fitToBudget(lines, 1000)
    expect(r.feasible).toBe(true)
    expect(total(r.lines)).toBe(1000)
    expect(r.lines.find((l) => l.category === 'venue')!.estimate).toBe(400)
    expect(r.lines.find((l) => l.category === 'favors')!.estimate).toBeLessThan(100)
  })

  it('also trims essentials (down to a floor) when optional cuts are not enough', () => {
    const r = fitToBudget(lines, 800)
    expect(r.feasible).toBe(true)
    expect(total(r.lines)).toBe(800)
    expect(r.lines.find((l) => l.category === 'venue')!.estimate).toBeLessThan(400)
    expect(r.lines.find((l) => l.category === 'venue')!.estimate).toBeGreaterThanOrEqual(300)
  })

  it('reports infeasible when even the floors exceed the budget', () => {
    const r = fitToBudget(lines, 300)
    expect(r.feasible).toBe(false)
    expect(total(r.lines)).toBeGreaterThan(300)
  })

  it('always sums exactly to budget when feasible, for awkward numbers', () => {
    const odd = [line('venue', 333_333, true), line('catering', 444_444, true), line('decor', 111_111), line('music', 77_777), line('photo', 55_555)]
    for (const budget of [900_001, 777_777, 1_000_000 - 7]) {
      const r = fitToBudget(odd, budget)
      if (r.feasible) expect(total(r.lines)).toBe(budget)
    }
  })

  it('never produces negative amounts', () => {
    expect(fitToBudget(lines, 1).lines.every((l) => l.estimate >= 0)).toBe(true)
  })
})

describe('analyzeBudget', () => {
  it('calculates totals, cost per guest and category shares', () => {
    const a = analyzeBudget([exp('a', 'venue', 600), exp('b', 'catering', 300, { actual: 400 }), exp('c', 'venue', 100)], 2000, 50)
    expect(a.total).toBe(1100)
    expect(a.perGuest).toBe(22)
    expect(a.difference).toBe(900)
    expect(a.overBudget).toBe(false)
    expect(a.byCategory[0]).toMatchObject({ category: 'venue', amount: 700 })
    expect(a.byCategory.reduce((s, c) => s + c.share, 0)).toBeCloseTo(100)
  })
  it('detects and quantifies an overrun', () => {
    const a = analyzeBudget([exp('a', 'venue', 1500)], 1000, 10)
    expect(a).toMatchObject({ overBudget: true, overBy: 500, difference: -500 })
  })
  it('handles zero guests safely', () => {
    expect(analyzeBudget([], 1000, 0).perGuest).toBe(0)
  })
})

describe('mergeBudget: protects paid, billed and hand-edited lines', () => {
  const existing = [
    exp('venue-paid', 'venue', 500, { actual: 520, paid: true }),
    exp('mine', 'decor', 200, { manual: true }),
    exp('old-catering', 'catering', 900),
  ]

  it('keeps protected expenses and drops replaceable ones', () => {
    const m = mergeBudget(existing, [line('catering', 800, true)], 5000)
    expect(m.kept.map((e) => e.id).sort()).toEqual(['mine', 'venue-paid'])
    expect(m.proposed.map((e) => e.category)).toEqual(['catering'])
  })

  it('does not double-count a category the user has already covered', () => {
    const m = mergeBudget(existing, [line('venue', 520), line('venue', 700, true, 'Venue extras')], 5000)
    expect(m.proposed).toHaveLength(1)
    expect(m.proposed[0]!.estimated).toBe(700)
    expect(m.issues.join(' ')).toMatch(/already covered/)
  })

  it('offers a trimmed alternative that fits when the proposal is over budget', () => {
    const m = mergeBudget(existing, [line('catering', 3000, true), line('music', 2000), line('favors', 1000)], 5000)
    const keptCost = 520 + 200
    const proposedTotal = m.proposed.reduce((a, e) => a + e.estimated, 0)
    expect(keptCost + proposedTotal).toBeGreaterThan(5000)
    expect(m.fitted).not.toBeNull()
    expect(keptCost + m.fitted!.reduce((a, e) => a + e.estimated, 0)).toBe(5000)
    expect(m.feasible).toBe(true)
  })

  it('flags when protected spend alone already exceeds the budget', () => {
    const m = mergeBudget([exp('big', 'venue', 5000, { manual: true })], [line('catering', 500, true)], 1000)
    expect(m.issues.join(' ')).toMatch(/already exceed/)
  })
})

describe('guest and budget rescaling (application arithmetic)', () => {
  const list = [exp('cat', 'catering', 1000), exp('billed', 'catering', 500, { actual: 500, paid: true }), exp('hall', 'venue', 2000), exp('fav', 'favors', 100)]

  it('scales per-guest categories linearly and leaves others alone', () => {
    const { expenses, skipped } = scaleForGuests(list, 100, 150)
    expect(expenses.find((e) => e.id === 'cat')!.estimated).toBe(1500)
    expect(expenses.find((e) => e.id === 'fav')!.estimated).toBe(150)
    expect(expenses.find((e) => e.id === 'hall')!.estimated).toBe(2000)
    expect(skipped.map((e) => e.id)).toEqual(['billed'])
  })

  it('is a no-op when headcount is unchanged', () => {
    expect(scaleForGuests(list, 100, 100).expenses).toBe(list)
  })

  it('rebalances unprotected lines to a lower budget without touching protected ones', () => {
    const r = rebalanceExpenses([exp('a', 'venue', 4000), exp('b', 'decor', 2000), exp('p', 'catering', 1000, { paid: true, actual: 1000 })], 5500)
    expect(r.feasible).toBe(true)
    expect(r.expenses.find((e) => e.id === 'p')!.estimated).toBe(1000)
    const sum = r.expenses.reduce((a, e) => a + (e.actual ?? e.estimated), 0)
    expect(sum).toBe(5500)
  })
})

