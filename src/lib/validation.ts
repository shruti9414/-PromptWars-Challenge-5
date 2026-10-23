import { MAX_PRIORITIES, PREFERENCES, PRIORITY_OPTIONS, THEMES } from '../data/constants'
import type {
  CategoryId,
  EventDraft,
  EventInput,
  EventType,
  GuestGroup,
  Priority,
  RsvpStatus,
  VendorStatus,
} from '../types'
import { daysBetween, isValidISODate } from './dates'

export type FieldErrors<T> = Partial<Record<keyof T, string>>

export const LIMITS = {
  name: { min: 3, max: 80 },
  location: { min: 2, max: 100 },
  guests: { min: 1, max: 5000 },
  budget: { min: 1000, max: 1_000_000_000 },
  notes: 500,
  title: 80,
  money: 1_000_000_000,
  plusOnes: 10,
} as const

export const WIZARD_STEPS = ['type', 'details', 'budget', 'preferences'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

export const EMPTY_DRAFT: EventDraft = {
  type: '',
  name: '',
  date: '',
  location: '',
  guestCount: '',
  budget: '',
  theme: '',
  venueStatus: '',
  priorities: [],
  preferences: [],
  notes: '',
  useSuggestedPlan: true,
}

/** Strips control characters and collapses whitespace so stored text is always plain, single-spaced. */
export function cleanText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Like cleanText but keeps line breaks (for free-form notes). */
export function cleanMultiline(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim()
}

/** Parses a user-typed number. Returns null for blanks, NaN or Infinity. */
export function parseNumber(value: string): number | null {
  const text = value.trim().replace(/,/g, '')
  if (text === '') return null
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

const EVENT_TYPE_IDS: EventType[] = ['wedding', 'birthday', 'anniversary', 'community']
const VENUE_IDS = ['not-started', 'shortlisting', 'booked', 'own-space']

function validateType(draft: EventDraft, errors: FieldErrors<EventDraft>) {
  if (!EVENT_TYPE_IDS.includes(draft.type as EventType)) errors.type = 'Choose the kind of event you are planning.'
}

function validateDetails(draft: EventDraft, errors: FieldErrors<EventDraft>, today: string, allowPast: boolean) {
  const name = cleanText(draft.name)
  if (name.length < LIMITS.name.min) errors.name = `Give your event a name (at least ${LIMITS.name.min} characters).`
  else if (name.length > LIMITS.name.max) errors.name = `Keep the name under ${LIMITS.name.max} characters.`

  if (!draft.date) errors.date = 'Pick the event date.'
  else if (!isValidISODate(draft.date)) errors.date = 'Enter a valid date.'
  else if (!allowPast && daysBetween(today, draft.date) < 0) errors.date = 'The event date cannot be in the past.'
  else if (draft.date > '2100-12-31') errors.date = 'Choose a date before 2101.'

  const location = cleanText(draft.location)
  if (location.length < LIMITS.location.min) errors.location = 'Where will it happen? Add a city or venue.'
  else if (location.length > LIMITS.location.max) errors.location = `Keep the location under ${LIMITS.location.max} characters.`

  const guests = parseNumber(draft.guestCount)
  if (guests === null || !Number.isInteger(guests)) errors.guestCount = 'Enter the expected guest count as a whole number.'
  else if (guests < LIMITS.guests.min || guests > LIMITS.guests.max)
    errors.guestCount = `Guest count must be between ${LIMITS.guests.min} and ${LIMITS.guests.max}.`
}

function validateBudget(draft: EventDraft, errors: FieldErrors<EventDraft>) {
  const budget = parseNumber(draft.budget)
  if (budget === null || !Number.isInteger(budget)) errors.budget = 'Enter your total budget as a whole number.'
  else if (budget < LIMITS.budget.min) errors.budget = `Budget must be at least ${LIMITS.budget.min.toLocaleString('en-US')}.`
  else if (budget > LIMITS.budget.max) errors.budget = 'That budget is larger than we can plan for.'

  if (!THEMES.some((t) => t.id === draft.theme)) errors.theme = 'Pick a theme to guide the look and feel.'
}

function validatePreferences(draft: EventDraft, errors: FieldErrors<EventDraft>) {
  if (draft.preferences.some((p) => !(PREFERENCES as readonly string[]).includes(p)))
    errors.preferences = 'One of the selected preferences is not recognised.'
  if (draft.venueStatus !== '' && !VENUE_IDS.includes(draft.venueStatus)) errors.venueStatus = 'Choose one of the listed venue statuses.'
  if (draft.priorities.length > MAX_PRIORITIES) errors.priorities = `Pick up to ${MAX_PRIORITIES} priorities.`
  else if (draft.priorities.some((p) => !PRIORITY_OPTIONS.some((o) => o.id === p))) errors.priorities = 'One of the selected priorities is not recognised.'
  if (cleanMultiline(draft.notes).length > LIMITS.notes) errors.notes = `Keep notes under ${LIMITS.notes} characters.`
}

export function validateStep(
  step: WizardStep,
  draft: EventDraft,
  today: string,
  allowPast = false,
): FieldErrors<EventDraft> {
  const errors: FieldErrors<EventDraft> = {}
  if (step === 'type') validateType(draft, errors)
  else if (step === 'details') validateDetails(draft, errors, today, allowPast)
  else if (step === 'budget') validateBudget(draft, errors)
  else validatePreferences(draft, errors)
  return errors
}

export function validateDraft(draft: EventDraft, today: string, allowPast = false): FieldErrors<EventDraft> {
  return WIZARD_STEPS.reduce<FieldErrors<EventDraft>>(
    (all, step) => ({ ...all, ...validateStep(step, draft, today, allowPast) }),
    {},
  )
}

export function stepOfField(field: keyof EventDraft): WizardStep {
  if (field === 'type') return 'type'
  if (field === 'name' || field === 'date' || field === 'location' || field === 'guestCount') return 'details'
  if (field === 'budget' || field === 'theme') return 'budget'
  return 'preferences'
}

/** Call only after validateDraft returned no errors. */
export function draftToInput(draft: EventDraft): EventInput {
  return {
    type: draft.type as EventType,
    name: cleanText(draft.name),
    date: draft.date,
    location: cleanText(draft.location),
    guestCount: Number(parseNumber(draft.guestCount)),
    budget: Number(parseNumber(draft.budget)),
    theme: draft.theme,
    preferences: draft.preferences.filter((p) => (PREFERENCES as readonly string[]).includes(p)),
    notes: cleanMultiline(draft.notes),
    venueStatus: draft.venueStatus === '' ? 'not-started' : draft.venueStatus,
    priorities: draft.priorities.filter((p) => PRIORITY_OPTIONS.some((o) => o.id === p)),
  }
}

export function inputToDraft(input: EventInput): EventDraft {
  return {
    type: input.type,
    name: input.name,
    date: input.date,
    location: input.location,
    guestCount: String(input.guestCount),
    budget: String(input.budget),
    theme: input.theme,
    preferences: [...input.preferences],
    notes: input.notes,
    venueStatus: input.venueStatus,
    priorities: [...input.priorities],
    useSuggestedPlan: false,
  }
}

/* ---------- Item forms (budget, timeline, vendors, guests) ---------- */

function validateMoney(value: string, label: string, required: boolean): { value: number | null; error?: string } {
  const n = parseNumber(value)
  if (n === null && value.trim() !== '') return { value: null, error: 'Enter a valid number.' }
  if (n === null) return required ? { value: null, error: `Enter ${label}.` } : { value: null }
  if (n < 0) return { value: null, error: `${label[0]?.toUpperCase()}${label.slice(1)} cannot be negative.` }
  if (n > LIMITS.money) return { value: null, error: 'That amount is too large.' }
  return { value: Math.round(n * 100) / 100 }
}

export interface ExpenseForm { title: string; category: CategoryId; estimated: string; actual: string }
export function validateExpense(form: ExpenseForm) {
  const errors: FieldErrors<ExpenseForm> = {}
  const title = cleanText(form.title)
  if (!title) errors.title = 'Name this expense.'
  else if (title.length > LIMITS.title) errors.title = `Keep it under ${LIMITS.title} characters.`
  const est = validateMoney(form.estimated, 'a planned amount', true)
  if (est.error) errors.estimated = est.error
  const act = validateMoney(form.actual, 'the actual amount', false)
  if (act.error) errors.actual = act.error
  return { errors, value: { title, estimated: est.value ?? 0, actual: act.value } }
}

export interface TaskForm { title: string; dueDate: string; priority: Priority }
/** `limit.maxDate` is the event date; a date already saved on the task (`limit.keep`) is never rejected so old tasks stay editable. */
export function validateTask(form: TaskForm, limit?: { maxDate: string; keep?: string }) {
  const errors: FieldErrors<TaskForm> = {}
  const title = cleanText(form.title)
  if (!title) errors.title = 'Describe the task.'
  else if (title.length > 120) errors.title = 'Keep it under 120 characters.'
  if (!isValidISODate(form.dueDate)) errors.dueDate = 'Pick a due date.'
  else if (limit && form.dueDate > limit.maxDate && form.dueDate !== limit.keep) errors.dueDate = 'A task cannot be due after the event date.'
  return { errors, value: { title } }
}

export interface VendorForm { name: string; category: CategoryId; status: VendorStatus; quote: string; notes: string }
export function validateVendor(form: VendorForm) {
  const errors: FieldErrors<VendorForm> = {}
  const name = cleanText(form.name)
  if (!name) errors.name = 'Add a vendor name or a placeholder like "Photographer shortlist".'
  else if (name.length > LIMITS.title) errors.name = `Keep it under ${LIMITS.title} characters.`
  const quote = validateMoney(form.quote, 'a quote', false)
  if (quote.error) errors.quote = quote.error
  const notes = cleanMultiline(form.notes)
  if (notes.length > 300) errors.notes = 'Keep notes under 300 characters.'
  return { errors, value: { name, quote: quote.value, notes } }
}

export interface GuestForm { name: string; group: GuestGroup; rsvp: RsvpStatus; plusOnes: string; dietary: string }
export function validateGuest(form: GuestForm) {
  const errors: FieldErrors<GuestForm> = {}
  const name = cleanText(form.name)
  if (!name) errors.name = 'Enter the guest name.'
  else if (name.length > LIMITS.title) errors.name = `Keep it under ${LIMITS.title} characters.`
  const plus = parseNumber(form.plusOnes === '' ? '0' : form.plusOnes)
  if (plus === null || !Number.isInteger(plus) || plus < 0 || plus > LIMITS.plusOnes)
    errors.plusOnes = `Plus-ones must be a whole number from 0 to ${LIMITS.plusOnes}.`
  const dietary = cleanText(form.dietary)
  if (dietary.length > 60) errors.dietary = 'Keep it under 60 characters.'
  return { errors, value: { name, plusOnes: plus ?? 0, dietary } }
}

export function validateBudgetTotal(value: string) {
  const n = parseNumber(value)
  if (n === null || !Number.isInteger(n)) return { error: 'Enter a whole number.', value: 0 }
  if (n < LIMITS.budget.min || n > LIMITS.budget.max) return { error: 'Budget is outside the supported range.', value: 0 }
  return { error: undefined, value: n }
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0
}

