import { screen } from '@testing-library/react'
import axe from 'axe-core'
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
  '#/', '#/app/dashboard', '#/app/events', '#/app/events/new', '#/app/events/demo-wedding/edit', '#/app/ai', '#/app/budget',
  '#/app/timeline', '#/app/vendors', '#/app/vendors/directory', '#/app/ideas', '#/app/guests', '#/app/settings',
]

/**
 * Runs the axe-core rule set (the engine behind most accessibility checkers) on the rendered page.
 * jsdom has no layout engine, so colour-contrast and visibility-based rules cannot run here; contrast is checked
 * separately from the design tokens, and layout still needs a real browser.
 */
async function violations() {
  const result = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  })
  return result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
}

describe('axe-core accessibility rules', () => {
  it.each(ROUTES)('%s has no violations', async (route) => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ live: false }), { status: 200 }))
    renderApp(route)
    await screen.findAllByRole('heading', { level: 1 })
    expect(await violations()).toEqual([])
  })

  it.each(['#/app/dashboard', '#/app/budget', '#/app/timeline', '#/app/guests', '#/app/ai'])('%s has no violations with no events', async (route) => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ live: false }), { status: 200 }))
    renderApp(route)
    store.clearAll()
    await screen.findAllByRole('heading', { level: 1 })
    expect(await violations()).toEqual([])
  })
})

describe('axe-core harness and dialogs', () => {
  it('actually detects problems (guards against a checker that silently passes)', async () => {
    document.body.innerHTML = '<main><img src="x.png"><button></button><input></main>'
    const found = await violations()
    expect(found.join('\n')).toMatch(/image-alt/)
    expect(found.join('\n')).toMatch(/button-name/)
    expect(found.join('\n')).toMatch(/label/)
    document.body.innerHTML = ''
  })

  it.each([
    ['#/app/timeline', /add task/i],
    ['#/app/budget', /add expense/i],
    ['#/app/guests', /add guest/i],
  ])('%s: the open "add" dialog has no violations', async (route, name) => {
    const { default: userEvent } = await import('@testing-library/user-event')
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ live: false }), { status: 200 }))
    renderApp(route)
    await userEvent.setup().click(await screen.findByRole('button', { name }))
    await screen.findByRole('dialog')
    expect(await violations()).toEqual([])
  })
})
