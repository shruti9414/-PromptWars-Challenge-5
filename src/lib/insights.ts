import type { EventPlan } from '../types'
import { sumMoney, summarizeBudget } from './budget'
import { daysBetween } from './dates'
import { guestStats, isOverdue } from './tasks'

export interface Insight {
  id: string
  tone: 'warn' | 'info' | 'good'
  title: string
  detail: string
  to: string
}

/**
 * Rule-based planning nudges derived from the event's own data. This is NOT AI:
 * it is the deterministic stand-in the Phase 2 assistant will replace.
 */
export function buildInsights(event: EventPlan, today: string): Insight[] {
  const out: Insight[] = []
  const days = daysBetween(today, event.date)
  const budget = summarizeBudget(event.budget, event.expenses)

  const overdue = event.tasks.filter((t) => isOverdue(t, today))
  if (overdue.length > 0)
    out.push({
      id: 'overdue',
      tone: 'warn',
      title: `${overdue.length} overdue ${overdue.length === 1 ? 'task' : 'tasks'}`,
      detail: `Start with "${overdue[0]?.title}" to get the timeline back on track.`,
      to: '/app/timeline',
    })

  for (const category of ['venue', 'catering'] as const) {
    const vendor = event.vendors.find((v) => v.category === category)
    if (vendor && vendor.status !== 'booked' && vendor.status !== 'completed' && days >= 0 && days <= 90)
      out.push({
        id: `unbooked-${category}`,
        tone: 'warn',
        title: `${category === 'venue' ? 'Venue' : 'Catering'} is not booked`,
        detail: `${days} days to go. Popular ${category === 'venue' ? 'venues' : 'caterers'} fill up early.`,
        to: '/app/vendors',
      })
  }

  if (budget.overBudget)
    out.push({
      id: 'over-budget',
      tone: 'warn',
      title: 'You are over budget',
      detail: 'Committed costs exceed your total. Trim a category or raise the budget.',
      to: '/app/budget',
    })
  else {
    // A starter plan allocates 100% of the budget by design, so only billed amounts that
    // exceed their estimates count as pressure.
    const overrun = sumMoney(event.expenses.map((e) => (e.actual !== null ? Math.max(0, e.actual - e.estimated) : 0)))
    if (overrun > 0)
      out.push({
        id: 'over-estimates',
        tone: 'info',
        title: 'Some bills are above their estimates',
        detail: `Billed items are ${overrun.toLocaleString('en-US')} over plan in total. Check the contingency line before committing more.`,
        to: '/app/budget',
      })
  }

  const guests = guestStats(event.guests)
  if (guests.invited > 0 && days >= 0 && days <= 30 && guests.pending / guests.invited > 0.4)
    out.push({
      id: 'rsvp-chase',
      tone: 'info',
      title: `${guests.pending} guests have not replied`,
      detail: 'Send a gentle reminder so catering numbers can be locked in.',
      to: '/app/guests',
    })
  if (guests.confirmedHeadcount > event.guestCount)
    out.push({
      id: 'over-capacity',
      tone: 'warn',
      title: 'Confirmed guests exceed your planned headcount',
      detail: `${guests.confirmedHeadcount} confirmed against ${event.guestCount} planned. Check venue capacity and catering.`,
      to: '/app/guests',
    })

  if (out.length === 0)
    out.push({
      id: 'on-track',
      tone: 'good',
      title: 'Everything looks on track',
      detail: 'No overdue tasks, budget pressure or unbooked essentials right now.',
      to: '/app/timeline',
    })
  return out
}

