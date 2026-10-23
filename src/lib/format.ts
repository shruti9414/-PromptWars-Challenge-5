import type { Currency } from '../types'

const LOCALES: Record<Currency, string> = { INR: 'en-IN', USD: 'en-US', EUR: 'en-IE', GBP: 'en-GB' }

export const CURRENCIES: { id: Currency; label: string }[] = [
  { id: 'INR', label: 'Indian Rupee (INR)' },
  { id: 'USD', label: 'US Dollar (USD)' },
  { id: 'EUR', label: 'Euro (EUR)' },
  { id: 'GBP', label: 'British Pound (GBP)' },
]

export function formatMoney(amount: number, currency: Currency, compact = false): string {
  return new Intl.NumberFormat(LOCALES[currency], {
    style: 'currency',
    currency,
    maximumFractionDigits: compact ? 1 : Number.isInteger(amount) ? 0 : 2,
    notation: compact ? 'compact' : 'standard',
  }).format(amount)
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
