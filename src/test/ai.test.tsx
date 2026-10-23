import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { assistantHandler, planHandler, statusHandler } from '../../server/handlers'
import type { ServerEnv } from '../../server/handlers'
import { createLimiter } from '../../server/rateLimit'
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

const wedding = () => store.getState().events.find((e) => e.id === 'demo-wedding')!
const respond = (r: { status: number; body: unknown }) => new Response(JSON.stringify(r.body), { status: r.status })

/** Routes the browser's fetch calls straight into the real server handlers. */
function stubApi(env: ServerEnv = { today: '2026-10-23' }, hooks: { failPlan?: () => Response | null } = {}) {
  const limiter = createLimiter(1000, 60_000)
  const calls: string[] = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push(url)
    if (url === '/api/status') return respond(statusHandler(env))
    const injected = hooks.failPlan?.()
    if (injected && url === '/api/plan') return injected
    const body = init?.body as string
    if (url === '/api/plan') return respond(await planHandler(body, env, limiter, 'test'))
    if (url === '/api/assistant') return respond(await assistantHandler(body, env, limiter, 'test'))
    throw new Error(`unexpected ${url}`)
  })
  return calls
}

describe('AI planner page: demo mode', () => {
  it('shows an honest demo-mode banner and what is sent to the AI', async () => {
    stubApi()
    renderApp('#/app/ai')
    expect(await screen.findByText(/No API key is configured on the server/i)).toBeInTheDocument()
    const sent = screen.getByLabelText('Data sent to the AI', { selector: 'pre' })
    expect(sent.textContent).toContain('"guestCount": 180')
    expect(sent.textContent).toContain('Midnight Garden')
    expect(sent.textContent).not.toMatch(/Aarav|Meera|Anika|Rohan/)
    expect(sent.textContent).not.toMatch(/notes/i)
  })

  it('generates a plan, previews it, and changes nothing until the user confirms', async () => {
    const user = userEvent.setup()
    stubApi()
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    const before = JSON.stringify(wedding())

    await user.click(screen.getByRole('button', { name: /generate (a new )?full plan/i }))
    const preview = await screen.findByRole('region', { name: /review proposed changes/i })
    expect(within(preview).getByText(/nothing has been changed yet/i)).toBeInTheDocument()
    expect(within(preview).getByText(/Demo planner, not AI/)).toBeInTheDocument()
    expect(within(preview).getByRole('region', { name: /budget proposal/i })).toBeInTheDocument()
    expect(within(preview).getByRole('region', { name: /timeline proposal/i })).toBeInTheDocument()
    expect(within(preview).getByRole('region', { name: /vendor proposal/i })).toBeInTheDocument()
    expect(within(preview).getByRole('region', { name: /risks and backup plans/i })).toBeInTheDocument()
    expect(JSON.stringify(wedding())).toBe(before)

    await user.click(within(preview).getByRole('button', { name: /apply changes/i }))
    const dialog = screen.getByRole('dialog', { name: /apply these changes/i })
    expect(JSON.stringify(wedding())).toBe(before) // still untouched while the dialog is open
    await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }))
    expect(JSON.stringify(wedding())).toBe(before)

    await user.click(within(preview).getByRole('button', { name: /apply changes/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /confirm and apply/i }))
    const after = wedding()
    expect(after.aiPlan?.source).toBe('demo')
    expect(after.revisions).toHaveLength(1)
    expect(after.expenses.filter((e) => e.paid).map((e) => e.id).sort()).toEqual(JSON.parse(before).expenses.filter((e: { paid: boolean }) => e.paid).map((e: { id: string }) => e.id).sort())
    expect(screen.queryByRole('region', { name: /review proposed changes/i })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /current ai plan/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /plan history/i })).toBeInTheDocument()
  })

  it('restores the previous version from plan history', async () => {
    const user = userEvent.setup()
    stubApi()
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    const original = JSON.stringify(wedding().tasks)
    await user.click(screen.getByRole('button', { name: 'Update timeline' }))
    const preview = await screen.findByRole('region', { name: /review proposed changes/i })
    await user.click(within(preview).getByRole('button', { name: /apply changes/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /confirm and apply/i }))
    expect(JSON.stringify(wedding().tasks)).not.toBe(original)

    await user.click(screen.getByRole('button', { name: /restore previous version/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^restore$/i }))
    expect(JSON.stringify(wedding().tasks)).toBe(original)
  })

  it('regenerates a single section only and keeps tasks the user already finished', async () => {
    const user = userEvent.setup()
    stubApi()
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    const before = wedding()
    await user.click(screen.getByRole('button', { name: 'Revise budget' }))
    const preview = await screen.findByRole('region', { name: /review proposed changes/i })
    expect(within(preview).getByRole('region', { name: /budget proposal/i })).toBeInTheDocument()
    expect(within(preview).queryByRole('region', { name: /timeline proposal/i })).not.toBeInTheDocument()
    await user.click(within(preview).getByRole('button', { name: /apply changes/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /confirm and apply/i }))
    const after = wedding()
    expect(after.tasks).toBe(before.tasks)
    expect(after.vendors).toBe(before.vendors)
    expect(after.expenses).not.toBe(before.expenses)
  })

  it('discarding a preview leaves the event untouched', async () => {
    const user = userEvent.setup()
    stubApi()
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    const before = JSON.stringify(wedding())
    await user.click(screen.getByRole('button', { name: 'Refresh vendor checklist' }))
    const preview = await screen.findByRole('region', { name: /review proposed changes/i })
    await user.click(within(preview).getByRole('button', { name: /discard/i }))
    expect(screen.queryByRole('region', { name: /review proposed changes/i })).not.toBeInTheDocument()
    expect(JSON.stringify(wedding())).toBe(before)
  })
})

describe('AI planner page: failures', () => {
  it('shows a retryable error when the service fails, keeps event data, and succeeds on retry', async () => {
    const user = userEvent.setup()
    let fail = true
    stubApi(undefined, { failPlan: () => (fail ? new Response(JSON.stringify({ error: { kind: 'provider_error', message: 'The AI service had a problem. Please try again.' } }), { status: 502 }) : null) })
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    const before = JSON.stringify(wedding())
    await user.click(screen.getByRole('button', { name: /generate full plan/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/had a problem/i)
    expect(alert).toHaveTextContent(/has not been changed/i)
    expect(JSON.stringify(wedding())).toBe(before)

    fail = false
    await user.click(within(alert).getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('region', { name: /review proposed changes/i })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('explains rate limits and timeouts', async () => {
    const user = userEvent.setup()
    stubApi(undefined, { failPlan: () => new Response(JSON.stringify({ error: { kind: 'rate_limited', message: 'Too many requests. Please wait a moment.', retryAfter: 30 } }), { status: 429 }) })
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    await user.click(screen.getByRole('button', { name: /generate full plan/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many requests/i)
    expect(screen.getByRole('button', { name: /try again \(wait about 30s\)/i })).toBeInTheDocument()
  })

  it('rejects an unusable AI response instead of showing it', async () => {
    const user = userEvent.setup()
    stubApi(undefined, { failPlan: () => new Response(JSON.stringify({ source: 'live', patch: { budget: { lines: [{ category: 'venue', title: 'x', estimate: -1 }] } } }), { status: 200 }) })
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    await user.click(screen.getByRole('button', { name: /generate full plan/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/unexpected format/i)
    expect(screen.queryByRole('region', { name: /review proposed changes/i })).not.toBeInTheDocument()
  })

  it('reports missing or invalid event details and links to the editor', async () => {
    const user = userEvent.setup()
    stubApi()
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    store.dispatch({ type: 'event/update', id: 'demo-wedding', patch: { location: '   ' } })
    await user.click(screen.getByRole('button', { name: /generate full plan/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/missing or invalid \(location\)/i)
    expect(within(alert).getByRole('link', { name: /edit event details/i })).toBeInTheDocument()
    expect(within(alert).queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
  })

  it('falls back to a clearly labelled in-browser demo when the API is unreachable', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch') })
    renderApp('#/app/ai')
    expect(await screen.findByText('Offline demo.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /generate full plan/i }))
    const preview = await screen.findByRole('region', { name: /review proposed changes/i })
    expect(within(preview).getByText(/Demo planner, not AI/)).toBeInTheDocument()
  })
})

describe('AI planner page: live mode label', () => {
  it('labels live results as AI with the model name', async () => {
    const user = userEvent.setup()
    const env: ServerEnv = {
      today: '2026-10-23', apiKey: 'sk-test', model: 'claude-test',
      fetchImpl: (async (_url: string, init: RequestInit) => {
        const { demoSection } = await import('../ai/demo')
        const sent = JSON.parse(init.body as string)
        const ctx = JSON.parse(/<event_context>\n([\s\S]*?)\nDerived/.exec(sent.messages[0].content)![1]!)
        return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'submit_event_plan', input: demoSection('full', ctx, '2026-10-23') }], stop_reason: 'tool_use' }), { status: 200 })
      }) as never,
    }
    stubApi(env)
    renderApp('#/app/ai')
    expect(await screen.findByText(/Live AI is on/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /generate full plan/i }))
    const preview = await screen.findByRole('region', { name: /review proposed changes/i })
    expect(within(preview).getByText(/Live AI · claude-test/)).toBeInTheDocument()
  })
})

describe('AI assistant', () => {
  const ask = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
    await user.type(screen.getByLabelText(/message to the assistant/i), text)
    await user.click(screen.getByRole('button', { name: /^send$/i }))
  }

  it('answers using the selected event and proposes (never applies) a budget cut', async () => {
    const user = userEvent.setup()
    stubApi()
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    expect(screen.getByText(/Demo assistant: keyword rules, not AI/)).toBeInTheDocument()
    const before = wedding().budget

    await ask(user, 'Reduce my wedding budget by 15%')
    expect(await screen.findByText(/Reducing the total budget by 15%/)).toBeInTheDocument()
    expect(screen.getByText(/2,800,000 INR/)).toBeInTheDocument() // known facts come from the event
    expect(screen.getByText(/Assumptions:/)).toBeInTheDocument()
    expect(wedding().budget).toBe(before)

    await user.click(screen.getByRole('button', { name: /review proposed changes/i }))
    const preview = await screen.findByRole('region', { name: /review proposed changes/i })
    expect(within(preview).getAllByText(/₹28,00,000/).length).toBeGreaterThan(0)
    expect(within(preview).getAllByText(/₹23,80,000/).length).toBeGreaterThan(0)
    expect(wedding().budget).toBe(before)

    await user.click(within(preview).getByRole('button', { name: /apply changes/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /confirm and apply/i }))
    expect(wedding().budget).toBe(2_380_000)
  })

  it('handles extra guests, a short runway, backup plans and menus', async () => {
    const user = userEvent.setup()
    stubApi()
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    await user.click(screen.getByRole('button', { name: 'Adjust the plan for 50 additional guests' }))
    expect(await screen.findByText(/Adding 50 guests/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'I have only seven days left. What should I prioritize?' }))
    expect(await screen.findByText(/With about 7 days left/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Suggest an indoor backup plan' }))
    expect(await screen.findByText(/Here is an indoor backup/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create a vegetarian-friendly menu' }))
    expect(await screen.findByText(/A vegetarian-friendly menu:/)).toBeInTheDocument()
    expect(wedding().guestCount).toBe(180)
  })

  it('asks for clarification instead of guessing when it does not understand', async () => {
    const user = userEvent.setup()
    stubApi()
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    await ask(user, 'make it nicer')
    expect(await screen.findByText(/What would you like to change/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /review proposed changes/i })).not.toBeInTheDocument()
  })

  it('shows a retry button when the assistant request fails', async () => {
    const user = userEvent.setup()
    let down = true
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url === '/api/status') return respond(statusHandler({}))
      if (down) return new Response(JSON.stringify({ error: { kind: 'timeout', message: 'The AI took too long to respond. Please try again.' } }), { status: 504 })
      return respond(await assistantHandler(init!.body as string, { today: '2026-10-23' }, createLimiter(100, 1000), 'x'))
    })
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    await ask(user, 'Reduce my budget by 10%')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/took too long/i)
    down = false
    await user.click(within(alert).getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.getByText(/Reducing the total budget by 10%/)).toBeInTheDocument())
    expect(screen.getAllByText('Reduce my budget by 10%')).toHaveLength(1)
  })

  it('limits message length in the input', async () => {
    stubApi()
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    const input = screen.getByLabelText(/message to the assistant/i) as HTMLInputElement
    expect(input.maxLength).toBe(600)
  })
})

describe('AI-generated data in the rest of the app', () => {
  it('shows descriptions, dependencies and booking deadlines on the timeline, and requirements on vendors', async () => {
    const user = userEvent.setup()
    stubApi()
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    await user.click(screen.getByRole('button', { name: 'Update timeline' }))
    const preview = await screen.findByRole('region', { name: /review proposed changes/i })
    await user.click(within(preview).getByRole('button', { name: /apply changes/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /confirm and apply/i }))
    await user.click(screen.getByRole('button', { name: 'Refresh vendor checklist' }))
    const p2 = await screen.findByRole('region', { name: /review proposed changes/i })
    await user.click(within(p2).getByRole('button', { name: /apply changes/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /confirm and apply/i }))

    await user.click(screen.getByRole('link', { name: 'Timeline' }))
    expect((await screen.findAllByText(/^After:/)).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Booking deadline').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('link', { name: 'Vendor Checklist' }))
    expect((await screen.findAllByText(/^Book by /)).length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Search criteria').length).toBeGreaterThan(0)
  })

  it('offers the full vendor status flow including completed', async () => {
    const user = userEvent.setup()
    renderApp('#/app/vendors')
    const select = screen.getByLabelText(/booking status for lakeview palace gardens/i)
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Needed', 'Contacted', 'Quote received', 'Booked', 'Completed', 'Declined'])
    await user.selectOptions(select, 'completed')
    expect(wedding().vendors.find((v) => v.name.startsWith('Lakeview'))?.status).toBe('completed')
    expect(screen.getByText('4 of 8')).toBeInTheDocument()
  })

  it('saves venue status and priorities from the wizard', async () => {
    const user = userEvent.setup()
    renderApp('#/app/events/demo-birthday/edit')
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: /next/i }))
    await user.selectOptions(screen.getByLabelText(/venue status/i), 'booked')
    await user.click(screen.getByRole('checkbox', { name: 'Photography & video' }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await screen.findByRole('heading', { level: 1, name: 'My Events' })
    const e = store.getState().events.find((x) => x.id === 'demo-birthday')!
    expect(e.venueStatus).toBe('booked')
    expect(e.priorities).toContain('Photography & video')
  })
})

