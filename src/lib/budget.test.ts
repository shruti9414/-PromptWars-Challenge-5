import { describe, expect, it } from 'vitest'
import type { Expense } from '../types'
import { allocateBudget, expenseCost, sumMoney, summarizeBudget, totalsByCategory } from './budget'

const exp = (id: string, category: Expense['category'], estimated: number, actual: number | null, paid = false): Expense => ({
  id, title: id, category, estimated, actual, paid,
})

describe('summarizeBudget', () => {
  const expenses = [
    exp('hall', 'venue', 1000, 1100, true),
    exp('food', 'catering', 2000, null),
    exp('band', 'music', 500, 400, true),
  ]

  it('uses actual when known and the estimate otherwise', () => {
    expect(expenseCost(expenses[0]!)).toBe(1100)
    expect(expenseCost(expenses[1]!)).toBe(2000)
  })

  it('adds up planned, committed, paid and remaining correctly', () => {
    const s = summarizeBudget(5000, expenses)
    expect(s.planned).toBe(3500)
    expect(s.committed).toBe(3500) // 1100 + 2000 + 400
    expect(s.paid).toBe(1500) // 1100 + 400
    expect(s.remaining).toBe(1500)
    expect(s.percentCommitted).toBeCloseTo(70)
    expect(s.overBudget).toBe(false)
    expect(s.overBy).toBe(0)
  })

  it('flags over-budget and reports by how much', () => {
    const s = summarizeBudget(3000, expenses)
    expect(s.overBudget).toBe(true)
    expect(s.remaining).toBe(-500)
    expect(s.overBy).toBe(500)
  })

  it('handles an empty list and a zero total without NaN', () => {
    const s = summarizeBudget(0, [])
    expect(s).toMatchObject({ planned: 0, committed: 0, paid: 0, remaining: 0, percentCommitted: 0, overBudget: false })
  })

  it('avoids floating point drift', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3)
    const s = summarizeBudget(1, [exp('a', 'venue', 0.1, null), exp('b', 'venue', 0.2, null)])
    expect(s.committed).toBe(0.3)
    expect(s.remaining).toBe(0.7)
  })
})

describe('totalsByCategory', () => {
  it('groups by category and sorts by committed spend', () => {
    const rows = totalsByCategory([
      exp('a', 'venue', 100, 150, true),
      exp('b', 'venue', 50, null),
      exp('c', 'decor', 400, null),
    ])
    expect(rows.map((r) => r.category)).toEqual(['decor', 'venue'])
    expect(rows[1]).toEqual({ category: 'venue', planned: 150, committed: 200, paid: 150 })
  })
})

describe('allocateBudget', () => {
  it('always adds up to exactly the total', () => {
    for (const total of [1000, 999_999, 2_500_000, 12_345, 7]) {
      const parts = allocateBudget(total, [{ pct: 28 }, { pct: 28 }, { pct: 10 }, { pct: 8 }, { pct: 6 }, { pct: 8 }, { pct: 2 }, { pct: 3 }, { pct: 2 }, { pct: 5 }])
      expect(parts.reduce((a, p) => a + p.amount, 0)).toBe(total)
      expect(parts.every((p) => Number.isInteger(p.amount) && p.amount >= 0)).toBe(true)
    }
  })

  it('keeps proportions for a clean split', () => {
    const [a, b] = allocateBudget(1000, [{ pct: 75 }, { pct: 25 }])
    expect([a?.amount, b?.amount]).toEqual([750, 250])
  })
})
