import type { CategoryId, Expense } from '../types'

const cents = (n: number) => Math.round(n * 100) / 100

export const sumMoney = (values: number[]): number => cents(values.reduce((a, b) => a + b, 0))

/** What an expense currently costs: the final amount if known, otherwise the estimate. */
export const expenseCost = (e: Expense): number => e.actual ?? e.estimated

export interface BudgetSummary {
  total: number
  /** Sum of all estimates. */
  planned: number
  /** Sum of actual-or-estimated cost: what you are on the hook for. */
  committed: number
  /** Sum of costs already paid. */
  paid: number
  /** Total budget minus committed. Negative when over budget. */
  remaining: number
  percentCommitted: number
  overBudget: boolean
  overBy: number
}

export function summarizeBudget(total: number, expenses: Expense[]): BudgetSummary {
  const planned = sumMoney(expenses.map((e) => e.estimated))
  const committed = sumMoney(expenses.map(expenseCost))
  const paid = sumMoney(expenses.filter((e) => e.paid).map(expenseCost))
  const remaining = cents(total - committed)
  return {
    total,
    planned,
    committed,
    paid,
    remaining,
    percentCommitted: total > 0 ? (committed / total) * 100 : 0,
    overBudget: remaining < 0,
    overBy: remaining < 0 ? Math.abs(remaining) : 0,
  }
}

export interface CategoryTotal {
  category: CategoryId
  planned: number
  committed: number
  paid: number
}

export function totalsByCategory(expenses: Expense[]): CategoryTotal[] {
  const map = new Map<CategoryId, CategoryTotal>()
  for (const e of expenses) {
    const row = map.get(e.category) ?? { category: e.category, planned: 0, committed: 0, paid: 0 }
    row.planned = cents(row.planned + e.estimated)
    row.committed = cents(row.committed + expenseCost(e))
    row.paid = cents(row.paid + (e.paid ? expenseCost(e) : 0))
    map.set(e.category, row)
  }
  return [...map.values()].sort((a, b) => b.committed - a.committed)
}

/**
 * Splits a whole-number budget by percentage shares using the largest-remainder method,
 * so the parts always add up to exactly the total.
 */
export function allocateBudget<T extends { pct: number }>(total: number, shares: T[]): (T & { amount: number })[] {
  const sumPct = shares.reduce((a, s) => a + s.pct, 0) || 1
  const raw = shares.map((s) => (total * s.pct) / sumPct)
  const floors = raw.map(Math.floor)
  let leftover = total - floors.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac)
  for (const { i } of order) {
    if (leftover <= 0) break
    floors[i] = (floors[i] ?? 0) + 1
    leftover -= 1
  }
  return shares.map((s, i) => ({ ...s, amount: floors[i] ?? 0 }))
}
