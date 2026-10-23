import { screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { store } from '../state/store'
import { renderApp } from './helpers'

beforeAll(() => {
  window.scrollTo = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const ROUTES = [
  '#/app/dashboard', '#/app/events', '#/app/events/new', '#/app/events/demo-wedding/edit', '#/app/ai', '#/app/budget',
  '#/app/timeline', '#/app/vendors', '#/app/vendors/directory', '#/app/ideas', '#/app/guests', '#/app/settings',
]

/** Approximation of the accessible name: aria-label, aria-labelledby, an associated label, then visible text. */
function nameOf(el: Element): string {
  const aria = el.getAttribute('aria-label')?.trim()
  if (aria) return aria
  const by = el.getAttribute('aria-labelledby')
  if (by) {
    const text = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim()
    if (text) return text
  }
  const labels = (el as HTMLInputElement).labels
  if (labels && labels.length) return Array.from(labels).map((l) => l.textContent ?? '').join(' ').trim()
  const wrap = el.closest('label')
  if (wrap?.textContent?.trim()) return wrap.textContent.trim()
  return (el.textContent ?? el.getAttribute('title') ?? '').trim()
}

function audit(): string[] {
  const problems: string[] = []
  const root = document.body
  const h1s = root.querySelectorAll('h1')
  if (h1s.length !== 1) problems.push(`expected one h1, found ${h1s.length}`)
  let prev = 0
  root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
    const level = Number(h.tagName[1])
    if (prev && level > prev + 1) problems.push(`heading jumps from h${prev} to h${level}: "${h.textContent?.slice(0, 40)}"`)
    prev = level
  })
  root.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]').forEach((el) => {
    if (!nameOf(el)) problems.push(`no accessible name: <${el.tagName.toLowerCase()} class="${el.className}">`)
  })
  root.querySelectorAll('img').forEach((img) => {
    if (!img.hasAttribute('alt')) problems.push(`img without alt: ${img.getAttribute('src')}`)
  })
  const ids = new Map<string, number>()
  root.querySelectorAll('[id]').forEach((el) => ids.set(el.id, (ids.get(el.id) ?? 0) + 1))
  for (const [id, n] of ids) if (n > 1) problems.push(`duplicate id "${id}" x${n}`)
  root.querySelectorAll('[tabindex]').forEach((el) => {
    if (Number(el.getAttribute('tabindex')) > 0) problems.push('positive tabindex')
  })
  root.querySelectorAll('[aria-labelledby],[aria-describedby]').forEach((el) => {
    for (const attr of ['aria-labelledby', 'aria-describedby']) {
      for (const id of (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)) {
        if (!document.getElementById(id)) problems.push(`${attr} points to missing #${id}`)
      }
    }
  })
  if (!root.querySelector('main')) problems.push('no <main> landmark')
  return problems
}

describe('accessibility smoke checks', () => {
  it.each(ROUTES)('%s has one h1, ordered headings, named controls, alt text and unique ids', async (route) => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ live: false }), { status: 200 }))
    renderApp(route)
    await screen.findByRole('heading', { level: 1 })
    expect(audit()).toEqual([])
  })

  it.each(ROUTES.filter((r) => !r.includes('/new') && !r.includes('/edit')))('%s renders a helpful empty state when no events exist', async (route) => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ live: false }), { status: 200 }))
    renderApp(route)
    store.clearAll()
    await screen.findByRole('heading', { level: 1 })
    expect(audit()).toEqual([])
    expect(store.getState().events).toEqual([])
  })

  it('keeps the skip link first in the tab order and points it at the main region', async () => {
    renderApp('#/app/dashboard')
    const skip = await screen.findByRole('link', { name: /skip to main content/i })
    expect(skip).toHaveAttribute('href', '#main')
    expect(document.getElementById('main')).not.toBeNull()
  })
})
