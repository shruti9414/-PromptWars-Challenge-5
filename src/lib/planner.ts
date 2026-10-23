import type { CategoryId, EventInput, EventType, Expense, Priority, Task, VendorBooking } from '../types'
import { allocateBudget } from './budget'
import { CATEGORY_BY_ID } from '../data/constants'
import { addDays, daysBetween } from './dates'
import { newId } from './format'

/**
 * Plan generation sits behind this interface so Phase 2 can swap the rule-based
 * templates below for a live AI planner without touching any screen.
 */
export interface GeneratedPlan {
  expenses: Expense[]
  tasks: Task[]
  vendors: VendorBooking[]
}

export interface PlannerService {
  generate(input: EventInput, today: string): GeneratedPlan
}

export interface BudgetShare { category: CategoryId; pct: number }
export interface TaskTemplate { title: string; daysBefore: number; priority: Priority; category?: CategoryId }

export const SHARES: Record<EventType, BudgetShare[]> = {
  wedding: [
    { category: 'venue', pct: 28 },
    { category: 'catering', pct: 28 },
    { category: 'decor', pct: 10 },
    { category: 'photo', pct: 8 },
    { category: 'music', pct: 6 },
    { category: 'attire', pct: 8 },
    { category: 'stationery', pct: 2 },
    { category: 'transport', pct: 3 },
    { category: 'favors', pct: 2 },
    { category: 'contingency', pct: 5 },
  ],
  birthday: [
    { category: 'venue', pct: 22 },
    { category: 'catering', pct: 30 },
    { category: 'decor', pct: 12 },
    { category: 'photo', pct: 6 },
    { category: 'music', pct: 10 },
    { category: 'stationery', pct: 2 },
    { category: 'favors', pct: 5 },
    { category: 'activities', pct: 6 },
    { category: 'contingency', pct: 7 },
  ],
  community: [
    { category: 'venue', pct: 25 },
    { category: 'catering', pct: 25 },
    { category: 'decor', pct: 8 },
    { category: 'music', pct: 12 },
    { category: 'stationery', pct: 5 },
    { category: 'transport', pct: 5 },
    { category: 'activities', pct: 10 },
    { category: 'contingency', pct: 10 },
  ],
}

export const TASKS: Record<EventType, TaskTemplate[]> = {
  wedding: [
    { title: 'Fix the guest list and city shortlist', daysBefore: 240, priority: 'high' },
    { title: 'Visit and book the venue', daysBefore: 220, priority: 'high', category: 'venue' },
    { title: 'Book photographer and videographer', daysBefore: 200, priority: 'high', category: 'photo' },
    { title: 'Finalise caterer and tasting', daysBefore: 160, priority: 'high', category: 'catering' },
    { title: 'Shop for outfits and book fittings', daysBefore: 130, priority: 'medium', category: 'attire' },
    { title: 'Send save-the-dates', daysBefore: 120, priority: 'medium', category: 'stationery' },
    { title: 'Book music, DJ or band', daysBefore: 100, priority: 'medium', category: 'music' },
    { title: 'Confirm decor and floral concept', daysBefore: 80, priority: 'medium', category: 'decor' },
    { title: 'Send formal invitations', daysBefore: 60, priority: 'high', category: 'stationery' },
    { title: 'Arrange guest transport and stays', daysBefore: 45, priority: 'medium', category: 'transport' },
    { title: 'Collect RSVPs and finalise headcount', daysBefore: 21, priority: 'high' },
    { title: 'Run the day-of schedule with vendors', daysBefore: 7, priority: 'high' },
    { title: 'Settle final vendor payments', daysBefore: 3, priority: 'medium' },
  ],
  birthday: [
    { title: 'Choose theme and set the guest list', daysBefore: 45, priority: 'high' },
    { title: 'Book the venue or reserve the space', daysBefore: 40, priority: 'high', category: 'venue' },
    { title: 'Send invitations', daysBefore: 28, priority: 'medium', category: 'stationery' },
    { title: 'Order the cake and menu', daysBefore: 21, priority: 'high', category: 'catering' },
    { title: 'Book entertainment or music', daysBefore: 21, priority: 'medium', category: 'music' },
    { title: 'Plan games and activities', daysBefore: 14, priority: 'low', category: 'activities' },
    { title: 'Buy decor and party favours', daysBefore: 10, priority: 'medium', category: 'decor' },
    { title: 'Confirm RSVPs and dietary needs', daysBefore: 7, priority: 'high' },
    { title: 'Set up and do a final walkthrough', daysBefore: 1, priority: 'medium' },
  ],
  community: [
    { title: 'Define the purpose, date and audience', daysBefore: 90, priority: 'high' },
    { title: 'Secure the venue and any permits', daysBefore: 75, priority: 'high', category: 'venue' },
    { title: 'Recruit volunteers and assign roles', daysBefore: 60, priority: 'medium' },
    { title: 'Line up speakers, performers or stalls', daysBefore: 50, priority: 'medium', category: 'music' },
    { title: 'Arrange food and refreshments', daysBefore: 35, priority: 'high', category: 'catering' },
    { title: 'Print posters and promote the event', daysBefore: 28, priority: 'medium', category: 'stationery' },
    { title: 'Plan accessibility, seating and signage', daysBefore: 21, priority: 'medium', category: 'decor' },
    { title: 'Confirm headcount and volunteer rota', daysBefore: 7, priority: 'high' },
    { title: 'Brief volunteers and test the AV', daysBefore: 2, priority: 'high' },
  ],
}

export const VENDOR_CATEGORIES: Record<EventType, CategoryId[]> = {
  wedding: ['venue', 'catering', 'photo', 'decor', 'music', 'attire', 'stationery', 'transport'],
  birthday: ['venue', 'catering', 'decor', 'music', 'photo', 'activities'],
  community: ['venue', 'catering', 'music', 'decor', 'stationery', 'activities'],
}

const VENDOR_PLACEHOLDER: Record<CategoryId, string> = {
  venue: 'Venue shortlist',
  catering: 'Caterer shortlist',
  decor: 'Decorator / florist shortlist',
  photo: 'Photographer shortlist',
  music: 'DJ / band shortlist',
  attire: 'Outfits and stylist',
  stationery: 'Invitation designer / printer',
  transport: 'Transport provider',
  favors: 'Favours supplier',
  activities: 'Activities host',
  contingency: 'Contingency',
}

/**
 * Due date for a template task. With a long runway the template is used as written;
 * on a short runway every offset is scaled down proportionally so nothing lands in the past.
 */
export function dueDate(eventDate: string, daysBefore: number, longest: number, today: string): string {
  const runway = daysBetween(today, eventDate)
  if (runway <= 0) return eventDate
  const scaled = runway >= longest ? daysBefore : Math.round((daysBefore * runway) / longest)
  return addDays(eventDate, -scaled)
}

/** The rule-based budget split for an event type, in whole currency units that add up to `budget`. */
export function suggestedSplit(type: EventType, budget: number) {
  return allocateBudget(budget, SHARES[type].map((s) => ({ ...s })))
}

export const templatePlanner: PlannerService = {
  generate(input, today) {
    const shares = allocateBudget(
      input.budget,
      SHARES[input.type].map((s) => ({ ...s })),
    )
    const expenses: Expense[] = shares.map((s) => ({
      id: newId(),
      title: CATEGORY_BY_ID[s.category].label,
      category: s.category,
      estimated: s.amount,
      actual: null,
      paid: false,
    }))
    const templates = TASKS[input.type]
    const longest = Math.max(...templates.map((t) => t.daysBefore))
    const tasks: Task[] = templates.map((t) => ({
      id: newId(),
      title: t.title,
      dueDate: dueDate(input.date, t.daysBefore, longest, today),
      priority: t.priority,
      done: false,
      category: t.category,
    }))
    const vendors: VendorBooking[] = VENDOR_CATEGORIES[input.type].map((category) => ({
      id: newId(),
      category,
      name: VENDOR_PLACEHOLDER[category],
      status: 'to-research',
      quote: null,
      notes: '',
    }))
    return { expenses, tasks, vendors }
  },
}

