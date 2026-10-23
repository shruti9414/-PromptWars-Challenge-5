import { PlanRevisionSchema, StoredAiPlanSchema } from '../ai/schema'
import type { AppState, Currency, EventDraft, EventPlan } from '../types'
import { isValidISODate } from '../lib/dates'
import { EMPTY_DRAFT } from '../lib/validation'

const STATE_KEY = 'gatherly.v1.state'
const DRAFT_KEY = 'gatherly.v1.wizard-draft'
const BACKUP_KEY = 'gatherly.v1.state-backup'
const VERSION = 1

const EVENT_TYPES = ['wedding', 'birthday', 'anniversary', 'community']
const CURRENCY_IDS: Currency[] = ['INR', 'USD', 'EUR', 'GBP']

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const everyObj = (v: unknown, keys: Record<string, (x: unknown) => boolean>): boolean =>
  Array.isArray(v) && v.every((i) => isObj(i) && Object.entries(keys).every(([k, check]) => check(i[k])))
/** Amounts and counts must be sane: a tampered negative estimate would silently flip every total. */
const isMoney = (v: unknown): v is number => isNum(v) && v >= 0 && v <= 1e12
const nullableMoney = (v: unknown) => v === null || isMoney(v)
const isCount = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0 && v <= 1e6
const optStr = (v: unknown) => v === undefined || isStr(v)
const optNum = (v: unknown) => v === undefined || isNum(v)
const optBool = (v: unknown) => v === undefined || typeof v === 'boolean'
const optStrArr = (v: unknown) => v === undefined || (Array.isArray(v) && v.every(isStr))

/**
 * localStorage is user-editable, so persisted data is structurally checked before it is trusted.
 * Anything that fails the check is discarded and the demo data is used instead.
 */
export function isEventPlan(v: unknown): v is EventPlan {
  if (!isObj(v)) return false
  return (
    isStr(v.id) &&
    EVENT_TYPES.includes(v.type as string) &&
    isStr(v.name) &&
    isStr(v.date) &&
    isValidISODate(v.date) &&
    isStr(v.location) &&
    isCount(v.guestCount) &&
    v.guestCount >= 1 &&
    isMoney(v.budget) &&
    isStr(v.theme) &&
    Array.isArray(v.preferences) &&
    v.preferences.every(isStr) &&
    isStr(v.notes) &&
    isStr(v.coverImage) &&
    v.coverImage.startsWith('/img/') &&
    typeof v.isDemo === 'boolean' &&
    isStr(v.createdAt) &&
    Array.isArray(v.savedIdeas) &&
    v.savedIdeas.every(isStr) &&
    everyObj(v.expenses, { id: isStr, title: isStr, category: isStr, estimated: isMoney, actual: nullableMoney, paid: (x) => typeof x === 'boolean', manual: optBool, vendorId: optStr }) &&
    everyObj(v.tasks, { id: isStr, title: isStr, dueDate: (x) => isStr(x) && isValidISODate(x), priority: isStr, done: (x) => typeof x === 'boolean', description: optStr, dependsOn: optStrArr, bookingDeadline: optBool, order: optNum, manual: optBool }) &&
    everyObj(v.vendors, { id: isStr, category: isStr, name: isStr, status: isStr, quote: nullableMoney, notes: isStr, requirement: optStr, criteria: optStrArr, bookBy: optStr, priority: optStr, manual: optBool, linkedExpenseId: optStr }) &&
    everyObj(v.guests, { id: isStr, name: isStr, group: isStr, rsvp: isStr, plusOnes: isCount, dietary: isStr })
  )
}

/** Optional AI fields are checked with Zod; invalid ones are dropped instead of discarding the whole event. */
function normaliseAiFields(e: EventPlan): EventPlan {
  const next: EventPlan = { ...e }
  const venueOk = ['not-started', 'shortlisting', 'booked', 'own-space'].includes(String(e.venueStatus))
  if (!venueOk) delete next.venueStatus
  if (e.favoriteVendors !== undefined && (!Array.isArray(e.favoriteVendors) || !e.favoriteVendors.every(isStr))) delete next.favoriteVendors
  if (!Array.isArray(e.priorities) || !e.priorities.every(isStr)) delete next.priorities
  const plan = StoredAiPlanSchema.safeParse(e.aiPlan)
  if (plan.success) next.aiPlan = plan.data
  else delete next.aiPlan
  if (Array.isArray(e.revisions)) next.revisions = e.revisions.filter((r) => PlanRevisionSchema.safeParse(r).success).slice(0, 8)
  else delete next.revisions
  return next
}

export interface ParseResult {
  state: AppState | null
  /** Events in the stored data that failed validation and were left out. */
  dropped: number
}

const DEFAULT_SETTINGS: AppState['settings'] = { currency: 'INR', displayName: '', reduceMotion: false }

/**
 * Reads stored data defensively. A damaged event is skipped instead of discarding every other event, and
 * damaged settings fall back to defaults. Returns state: null only when nothing usable was found.
 */
export function parseStateDetailed(raw: string | null): ParseResult {
  if (!raw) return { state: null, dropped: 0 }
  try {
    const data: unknown = JSON.parse(raw)
    if (!isObj(data) || data.version !== VERSION || !Array.isArray(data.events)) return { state: null, dropped: 0 }
    const seen = new Set<string>()
    const events: EventPlan[] = []
    for (const candidate of data.events) {
      if (isEventPlan(candidate) && !seen.has(candidate.id)) {
        seen.add(candidate.id)
        events.push(normaliseAiFields(candidate))
      }
    }
    const dropped = data.events.length - events.length
    if (events.length === 0 && dropped > 0) return { state: null, dropped }
    const s = data.settings
    const settings =
      isObj(s) && CURRENCY_IDS.includes(s.currency as Currency) && isStr(s.displayName) && typeof s.reduceMotion === 'boolean'
        ? { currency: s.currency as Currency, displayName: s.displayName.slice(0, 40), reduceMotion: s.reduceMotion }
        : { ...DEFAULT_SETTINGS }
    const active = isStr(data.activeEventId) && events.some((e) => e.id === data.activeEventId) ? data.activeEventId : (events[0]?.id ?? null)
    return { state: { events, activeEventId: active, settings }, dropped }
  } catch {
    return { state: null, dropped: 0 }
  }
}

export function parseState(raw: string | null): AppState | null {
  return parseStateDetailed(raw).state
}

let loadNotice: string | null = null

/** A message about data that could not be read at startup, or null. Stays until dismissed. */
export const getLoadNotice = (): string | null => loadNotice
export function dismissLoadNotice(): void {
  loadNotice = null
}

/**
 * Loads saved state. If anything in storage was unreadable, the original text is copied to a backup key first
 * so that saving new changes can never destroy the only copy of the user's data.
 */
export function loadState(): AppState | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STATE_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  const { state, dropped } = parseStateDetailed(raw)
  if (state && dropped === 0) return state
  try {
    if (!localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, raw)
  } catch {
    /* A full or blocked store cannot hold a backup; carry on. */
  }
  loadNotice = state
    ? `${dropped} saved event${dropped === 1 ? '' : 's'} could not be read and ${dropped === 1 ? 'was' : 'were'} skipped. The rest of your data is intact, and a copy of the original was kept in this browser.`
    : 'Your saved data could not be read, so the sample events were loaded. A copy of the original was kept in this browser.'
  return state
}

/** Returns false when the browser refused the write (storage full or blocked). The app keeps working in memory. */
export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ version: VERSION, ...state }))
    return true
  } catch {
    return false
  }
}

export function clearSavedState(): void {
  try {
    localStorage.removeItem(STATE_KEY)
  } catch {
    /* ignore */
  }
}

export function loadDraft(): EventDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return { ...EMPTY_DRAFT }
    const d: unknown = JSON.parse(raw)
    if (!isObj(d)) return { ...EMPTY_DRAFT }
    return {
      type: EVENT_TYPES.includes(d.type as string) ? (d.type as EventDraft['type']) : '',
      name: isStr(d.name) ? d.name.slice(0, 120) : '',
      date: isStr(d.date) ? d.date : '',
      location: isStr(d.location) ? d.location.slice(0, 160) : '',
      guestCount: isStr(d.guestCount) ? d.guestCount.slice(0, 8) : '',
      budget: isStr(d.budget) ? d.budget.slice(0, 14) : '',
      theme: isStr(d.theme) ? d.theme : '',
      venueStatus: ['not-started', 'shortlisting', 'booked', 'own-space'].includes(String(d.venueStatus)) ? (d.venueStatus as EventDraft['venueStatus']) : '',
      priorities: Array.isArray(d.priorities) ? d.priorities.filter(isStr).slice(0, 8) : [],
      preferences: Array.isArray(d.preferences) ? d.preferences.filter(isStr).slice(0, 20) : [],
      notes: isStr(d.notes) ? d.notes.slice(0, 600) : '',
      useSuggestedPlan: d.useSuggestedPlan !== false,
    }
  } catch {
    return { ...EMPTY_DRAFT }
  }
}

export function saveDraft(draft: EventDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* ignore */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

