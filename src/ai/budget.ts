import { CATEGORY_BY_ID } from '../data/constants'
import { expenseCost, sumMoney } from '../lib/budget'
import { newId } from '../lib/format'
import type { CategoryId, Expense } from '../types'
import type { BudgetLineAI } from './schema'
import { isProtectedExpense } from './context'
import type { Flexibility } from './context'

/** Minimum share of the budget that must be left as a contingency reserve, by how flexible the user is. */
export const CONTINGENCY_MIN: Record<Flexibility, number> = { strict: 0.1, moderate: 0.07, flexible: 0.05 }

/** Largest estimate we accept for one line, as a multiple of the whole budget. Anything above is treated as a model error. */
const MAX_LINE_MULTIPLE = 2

export interface CleanLine {
  category: CategoryId
  title: string
  estimate: number
  rationale: string
  essential: boolean
}

export interface LineIssue { message: string }

/**
 * Model-supplied numbers are never trusted: non-finite, negative or absurd estimates are dropped or
 * clamped here, amounts are rounded to whole currency units and duplicate categories+titles are merged.
 */
export function sanitizeLines(lines: BudgetLineAI[], budget: number): { lines: CleanLine[]; issues: string[] } {
  const issues: string[] = []
  const out: CleanLine[] = []
  for (const l of lines) {
    if (!Number.isFinite(l.estimate) || l.estimate < 0) {
      issues.push(`Dropped "${l.title}" because its estimate was not a valid amount.`)
      continue
    }
    let estimate = Math.round(l.estimate)
    if (estimate > budget * MAX_LINE_MULTIPLE) {
      issues.push(`"${l.title}" was estimated at more than ${MAX_LINE_MULTIPLE}x your whole budget, so it was capped at the budget.`)
      estimate = budget
    }
    const existing = out.find((o) => o.category === l.category && o.title.toLowerCase() === l.title.toLowerCase())
    if (existing) {
      existing.estimate += estimate
      continue
    }
    out.push({ category: l.category, title: l.title, estimate, rationale: l.rationale, essential: l.essential })
  }
  return { lines: out, issues }
}

/** Ensures a contingency line of at least the required share of the budget exists (adds or raises it). */
export function ensureContingency(lines: CleanLine[], budget: number, flexibility: Flexibility): CleanLine[] {
  const needed = Math.round(budget * CONTINGENCY_MIN[flexibility])
  const existing = lines.find((l) => l.category === 'contingency')
  if (existing) {
    return lines.map((l) => (l === existing ? { ...l, estimate: Math.max(l.estimate, needed), essential: true } : l))
  }
  return [
    ...lines,
    {
      category: 'contingency',
      title: 'Contingency reserve',
      estimate: needed,
      rationale: `Keeps ${Math.round(CONTINGENCY_MIN[flexibility] * 100)}% free for surprises. Added automatically for a ${flexibility} budget.`,
      essential: true,
    },
  ]
}

export interface FitResult {
  lines: CleanLine[]
  total: number
  /** True when the lines now fit the budget. False when even the maximum sensible trimming is not enough. */
  feasible: boolean
}

const NON_ESSENTIAL_FLOOR = 0.4
const ESSENTIAL_FLOOR = 0.75

/**
 * Trims lines so they fit `budget`: optional lines are cut first (down to 40%), then essential lines
 * (down to 75%). Pure arithmetic: the model plays no part in the final numbers.
 */
export function fitToBudget(lines: CleanLine[], budget: number): FitResult {
  const total = lines.reduce((a, l) => a + l.estimate, 0)
  if (total <= budget) return { lines: lines.map((l) => ({ ...l })), total, feasible: true }

  const need = total - budget
  const optional = lines.filter((l) => !l.essential)
  const essential = lines.filter((l) => l.essential)
  const optionalRoom = optional.reduce((a, l) => a + l.estimate * (1 - NON_ESSENTIAL_FLOOR), 0)
  const essentialRoom = essential.reduce((a, l) => a + l.estimate * (1 - ESSENTIAL_FLOOR), 0)

  const optionalCut = Math.min(need, optionalRoom)
  const essentialCut = Math.min(need - optionalCut, essentialRoom)
  const cutRatio = (l: CleanLine) => {
    if (l.essential) return essentialRoom > 0 ? (essentialCut / essentialRoom) * (1 - ESSENTIAL_FLOOR) : 0
    return optionalRoom > 0 ? (optionalCut / optionalRoom) * (1 - NON_ESSENTIAL_FLOOR) : 0
  }

  const fitted = lines.map((l) => ({ ...l, estimate: Math.max(0, Math.round(l.estimate * (1 - cutRatio(l)))) }))
  let newTotal = fitted.reduce((a, l) => a + l.estimate, 0)
  const feasible = need - optionalCut - essentialCut < 0.5

  // Rounding can leave a few units over; take them from the largest line so the total lands exactly on budget.
  if (feasible && newTotal !== budget) {
    const largest = fitted.reduce((a, b) => (b.estimate > a.estimate ? b : a), fitted[0]!)
    largest.estimate += budget - newTotal
    newTotal = budget
  }
  return { lines: fitted, total: newTotal, feasible }
}

export interface BudgetAnalysis {
  budget: number
  total: number
  perGuest: number
  /** budget - total. Negative when over budget. */
  difference: number
  overBudget: boolean
  overBy: number
  byCategory: { category: CategoryId; label: string; amount: number; share: number }[]
}

export function analyzeBudget(expenses: Pick<Expense, 'category' | 'estimated' | 'actual'>[], budget: number, guests: number): BudgetAnalysis {
  const cost = (e: Pick<Expense, 'estimated' | 'actual'>) => e.actual ?? e.estimated
  const total = sumMoney(expenses.map(cost))
  const map = new Map<CategoryId, number>()
  for (const e of expenses) map.set(e.category, sumMoney([map.get(e.category) ?? 0, cost(e)]))
  const difference = sumMoney([budget - total])
  return {
    budget,
    total,
    perGuest: guests > 0 ? Math.round(total / guests) : 0,
    difference,
    overBudget: difference < 0,
    overBy: difference < 0 ? Math.abs(difference) : 0,
    byCategory: [...map.entries()]
      .map(([category, amount]) => ({ category, label: CATEGORY_BY_ID[category].label, amount, share: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount),
  }
}

export interface BudgetMerge {
  kept: Expense[]
  proposed: Expense[]
  /** A version trimmed to fit, present only when `proposed` exceeds the budget. */
  fitted: Expense[] | null
  feasible: boolean
  issues: string[]
}

const toExpense = (l: CleanLine): Expense => ({
  id: newId(), title: l.title, category: l.category, estimated: l.estimate, actual: null, paid: false,
})

/**
 * Combines generated lines with the expenses the user already owns. Paid, billed or hand-edited
 * expenses stay as they are; generated lines only cover what remains of each category and of the budget.
 */
export function mergeBudget(existing: Expense[], lines: CleanLine[], budget: number): BudgetMerge {
  const kept = existing.filter(isProtectedExpense)
  const issues: string[] = []
  const keptByCategory = new Map<CategoryId, number>()
  for (const e of kept) keptByCategory.set(e.category, (keptByCategory.get(e.category) ?? 0) + expenseCost(e))

  const remainingByCategory = new Map(keptByCategory)
  const adjusted: CleanLine[] = []
  for (const l of lines) {
    const covered = remainingByCategory.get(l.category) ?? 0
    if (covered > 0) {
      const use = Math.min(covered, l.estimate)
      remainingByCategory.set(l.category, covered - use)
      if (use === l.estimate) {
        issues.push(`"${l.title}" is already covered by your own ${CATEGORY_BY_ID[l.category].label.toLowerCase()} entries.`)
        continue
      }
      adjusted.push({ ...l, estimate: l.estimate - use, title: `${l.title} (remaining)` })
    } else {
      adjusted.push(l)
    }
  }

  const keptTotal = sumMoney(kept.map(expenseCost))
  const room = Math.max(0, budget - keptTotal)
  const proposed = adjusted.map(toExpense)
  const proposedTotal = sumMoney(proposed.map((e) => e.estimated))
  if (keptTotal > budget) issues.push('Your own entries already exceed the total budget, so nothing more can be added without raising it.')

  if (proposedTotal <= room) return { kept, proposed, fitted: null, feasible: true, issues }
  const fit = fitToBudget(adjusted, room)
  return { kept, proposed, fitted: fit.lines.filter((l) => l.estimate > 0).map(toExpense), feasible: fit.feasible, issues }
}

/** Categories whose cost scales with headcount. */
const PER_GUEST: CategoryId[] = ['catering', 'favors']

/** Scales per-guest categories for a new headcount. Protected (billed/paid/hand-edited) lines are left alone. */
export function scaleForGuests(expenses: Expense[], from: number, to: number): { expenses: Expense[]; skipped: Expense[] } {
  if (from <= 0 || from === to) return { expenses, skipped: [] }
  const ratio = to / from
  const skipped: Expense[] = []
  const next = expenses.map((e) => {
    if (!PER_GUEST.includes(e.category)) return e
    if (isProtectedExpense(e)) {
      skipped.push(e)
      return e
    }
    return { ...e, estimated: Math.round(e.estimated * ratio) }
  })
  return { expenses: next, skipped }
}

/** Rescales unprotected lines so total cost lands on the new budget. */
export function rebalanceExpenses(expenses: Expense[], budget: number): { expenses: Expense[]; feasible: boolean } {
  const protectedTotal = sumMoney(expenses.filter(isProtectedExpense).map(expenseCost))
  const open = expenses.filter((e) => !isProtectedExpense(e))
  const lines: CleanLine[] = open.map((e) => ({ category: e.category, title: e.title, estimate: e.estimated, rationale: '', essential: e.category === 'venue' || e.category === 'catering' || e.category === 'contingency' }))
  const fit = fitToBudget(lines, Math.max(0, budget - protectedTotal))
  const byId = new Map(open.map((e, i) => [e.id, fit.lines[i]!.estimate]))
  return {
    expenses: expenses.map((e) => (byId.has(e.id) ? { ...e, estimated: byId.get(e.id)! } : e)),
    feasible: fit.feasible && protectedTotal <= budget,
  }
}
