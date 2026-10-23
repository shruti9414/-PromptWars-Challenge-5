import { describe, expect, it } from 'vitest'
import type { EventDraft } from '../types'
import {
  EMPTY_DRAFT,
  cleanMultiline,
  cleanText,
  draftToInput,
  hasErrors,
  parseNumber,
  validateBudgetTotal,
  validateDraft,
  validateExpense,
  validateGuest,
  validateStep,
  validateTask,
  validateVendor,
} from './validation'

const TODAY = '2026-10-23'

const valid: EventDraft = {
  type: 'wedding',
  name: 'Aarav & Meera',
  date: '2027-02-14',
  location: 'Udaipur',
  guestCount: '150',
  budget: '2500000',
  theme: 'midnight-garden',
  venueStatus: 'shortlisting',
  priorities: ['Venue'],
  preferences: ['Outdoor', 'DJ'],
  notes: 'Garden ceremony',
  useSuggestedPlan: true,
}

describe('text helpers', () => {
  it('cleanText strips control characters and collapses whitespace', () => {
    expect(cleanText('  Hello\u0000   \n world\t ')).toBe('Hello world')
  })
  it('cleanMultiline keeps line breaks but drops other control characters', () => {
    expect(cleanMultiline('a\nb\u0007c ')).toBe('a\nbc')
  })
  it('parseNumber accepts commas and rejects junk', () => {
    expect(parseNumber('1,200')).toBe(1200)
    expect(parseNumber('12.5')).toBe(12.5)
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber('1e9')).toBeNull()
    expect(parseNumber('Infinity')).toBeNull()
  })
})

describe('event wizard validation', () => {
  it('accepts a complete, valid draft', () => {
    expect(validateDraft(valid, TODAY)).toEqual({})
  })

  it('requires an event type', () => {
    expect(validateStep('type', EMPTY_DRAFT, TODAY).type).toBeDefined()
    expect(validateStep('type', { ...valid, type: 'funeral' as never }, TODAY).type).toBeDefined()
  })

  it('validates name length and trims whitespace-only names', () => {
    expect(validateStep('details', { ...valid, name: '  ab ' }, TODAY).name).toMatch(/at least 3/)
    expect(validateStep('details', { ...valid, name: ' '.repeat(10) }, TODAY).name).toBeDefined()
    expect(validateStep('details', { ...valid, name: 'x'.repeat(81) }, TODAY).name).toMatch(/under 80/)
  })

  it('rejects missing, malformed, impossible and past dates', () => {
    expect(validateStep('details', { ...valid, date: '' }, TODAY).date).toMatch(/Pick/)
    expect(validateStep('details', { ...valid, date: '2027-02-31' }, TODAY).date).toMatch(/valid/)
    expect(validateStep('details', { ...valid, date: 'tomorrow' }, TODAY).date).toMatch(/valid/)
    expect(validateStep('details', { ...valid, date: '2026-10-22' }, TODAY).date).toMatch(/past/)
  })

  it('allows today, and allows a past date only when editing an existing event', () => {
    expect(validateStep('details', { ...valid, date: TODAY }, TODAY).date).toBeUndefined()
    expect(validateStep('details', { ...valid, date: '2026-01-01' }, TODAY, true).date).toBeUndefined()
  })

  it('validates guest count as a whole number in range', () => {
    for (const bad of ['', '0', '-3', '12.5', 'many', '5001']) {
      expect(validateStep('details', { ...valid, guestCount: bad }, TODAY).guestCount, bad).toBeDefined()
    }
    expect(validateStep('details', { ...valid, guestCount: '1' }, TODAY).guestCount).toBeUndefined()
    expect(validateStep('details', { ...valid, guestCount: '5000' }, TODAY).guestCount).toBeUndefined()
  })

  it('requires a location', () => {
    expect(validateStep('details', { ...valid, location: ' a ' }, TODAY).location).toBeDefined()
  })

  it('validates budget and theme', () => {
    for (const bad of ['', '0', '999', '-5000', '12.5', 'lots', '2000000000']) {
      expect(validateStep('budget', { ...valid, budget: bad }, TODAY).budget, bad).toBeDefined()
    }
    expect(validateStep('budget', { ...valid, theme: '' }, TODAY).theme).toBeDefined()
    expect(validateStep('budget', { ...valid, theme: 'not-a-theme' }, TODAY).theme).toBeDefined()
    expect(validateStep('budget', valid, TODAY)).toEqual({})
  })

  it('rejects unknown preferences and over-long notes', () => {
    expect(validateStep('preferences', { ...valid, preferences: ['<script>'] }, TODAY).preferences).toBeDefined()
    expect(validateStep('preferences', { ...valid, notes: 'n'.repeat(501) }, TODAY).notes).toBeDefined()
  })

  it('validates venue status and priorities', () => {
    expect(validateStep('preferences', { ...valid, venueStatus: 'maybe' as never }, TODAY).venueStatus).toBeDefined()
    expect(validateStep('preferences', { ...valid, priorities: ['Venue', 'Food & catering', 'Decor & ambience', 'Photography & video', 'Keeping costs low'] }, TODAY).priorities).toMatch(/up to 4/)
    expect(validateStep('preferences', { ...valid, priorities: ['Hack'] }, TODAY).priorities).toBeDefined()
    expect(validateStep('preferences', { ...valid, venueStatus: '' }, TODAY)).toEqual({})
    expect(draftToInput({ ...valid, venueStatus: '' }).venueStatus).toBe('not-started')
  })

  it('reports errors from every step in validateDraft', () => {
    const errors = validateDraft(EMPTY_DRAFT, TODAY)
    expect(hasErrors(errors)).toBe(true)
    expect(Object.keys(errors)).toEqual(expect.arrayContaining(['type', 'name', 'date', 'location', 'guestCount', 'budget', 'theme']))
  })

  it('converts a valid draft to a typed, sanitised input', () => {
    const input = draftToInput({ ...valid, name: '  Aarav   &\tMeera ', budget: '2,500,000', preferences: ['DJ', 'bogus'] })
    expect(input).toMatchObject({ name: 'Aarav & Meera', budget: 2500000, guestCount: 150, preferences: ['DJ'] })
  })
})

describe('item form validation', () => {
  it('validates expenses', () => {
    expect(validateExpense({ title: '', category: 'venue', estimated: '100', actual: '' }).errors.title).toBeDefined()
    expect(validateExpense({ title: 'Hall', category: 'venue', estimated: '', actual: '' }).errors.estimated).toBeDefined()
    expect(validateExpense({ title: 'Hall', category: 'venue', estimated: '-1', actual: '' }).errors.estimated).toMatch(/negative/)
    expect(validateExpense({ title: 'Hall', category: 'venue', estimated: '100', actual: 'x' }).errors.actual).toBeDefined()
    const ok = validateExpense({ title: ' Hall ', category: 'venue', estimated: '1,000.456', actual: '' })
    expect(ok.errors).toEqual({})
    expect(ok.value).toEqual({ title: 'Hall', estimated: 1000.46, actual: null })
  })

  it('validates tasks', () => {
    expect(validateTask({ title: ' ', dueDate: '2026-11-01', priority: 'low' }).errors.title).toBeDefined()
    expect(validateTask({ title: 'Book DJ', dueDate: '', priority: 'low' }).errors.dueDate).toBeDefined()
    expect(validateTask({ title: 'Book DJ', dueDate: '2026-11-01', priority: 'low' }).errors).toEqual({})
  })

  it('validates guests (plus-ones must be 0 to 10)', () => {
    const base = { name: 'Asha', group: 'family', rsvp: 'pending', plusOnes: '0', dietary: '' } as const
    expect(validateGuest({ ...base, name: '' }).errors.name).toBeDefined()
    expect(validateGuest({ ...base, plusOnes: '11' }).errors.plusOnes).toBeDefined()
    expect(validateGuest({ ...base, plusOnes: '1.5' }).errors.plusOnes).toBeDefined()
    expect(validateGuest({ ...base, plusOnes: '' }).errors).toEqual({})
    expect(validateGuest({ ...base, plusOnes: '3' }).value.plusOnes).toBe(3)
  })

  it('validates vendors and the budget total', () => {
    expect(validateVendor({ name: '', category: 'venue', status: 'booked', quote: '', notes: '' }).errors.name).toBeDefined()
    expect(validateVendor({ name: 'A', category: 'venue', status: 'booked', quote: '-4', notes: '' }).errors.quote).toBeDefined()
    expect(validateBudgetTotal('50').error).toBeDefined()
    expect(validateBudgetTotal('50000')).toEqual({ error: undefined, value: 50000 })
  })
})

