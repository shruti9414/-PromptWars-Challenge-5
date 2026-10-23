import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { assistantHandler, planHandler, statusHandler } from '../../server/handlers'
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

const env = { today: '2026-10-23' }
const wedding = () => store.getState().events.find((e) => e.id === 'demo-wedding')!
const respond = (r: { status: number; body: unknown }) => new Response(JSON.stringify(r.body), { status: r.status })

/** A plan endpoint whose answers the test releases by hand, so in-flight behaviour can be observed. */
function slowApi() {
  const limiter = createLimiter(1000, 60_000)
  const pending: Array<() => void> = []
  let planCalls = 0
  let mode: 'ok' | 'fail' = 'ok'
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    if (url === '/api/status') return Promise.resolve(respond(statusHandler(env)))
    if (url === '/api/plan') {
      planCalls++
      return new Promise<Response>((resolve) => {
        pending.push(() => {
          if (mode === 'fail') resolve(new Response(JSON.stringify({ error: { kind: 'provider_error', message: 'The AI service had a problem. Please try again.' } }), { status: 502 }))
          else void planHandler(init!.body as string, env, limiter, 'k').then((r) => resolve(respond(r)))
        })
      })
    }
    if (url === '/api/assistant') return assistantHandler(init!.body as string, env, limiter, 'k').then(respond)
    return Promise.reject(new Error(`unexpected ${url}`))
  })
  return {
    release: () => pending.shift()?.(),
    calls: () => planCalls,
    failNext: () => { mode = 'fail' },
    succeedNext: () => { mode = 'ok' },
  }
}

describe('AI requests in flight', () => {
  it('sends only one request however often the button is clicked, and disables every plan action meanwhile', async () => {
    const user = userEvent.setup()
    const api = slowApi()
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    const generate = screen.getByRole('button', { name: /generate full plan/i })
    await user.click(generate)
    await user.dblClick(screen.getByRole('button', { name: /generating/i }))
    expect(api.calls()).toBe(1)
    expect(screen.getByRole('button', { name: 'Regenerate theme' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Revise budget' })).toBeDisabled()
    expect(screen.getByText(/building your plan/i)).toBeInTheDocument()
    api.release()
    expect(await screen.findByRole('region', { name: /review proposed changes/i })).toBeInTheDocument()
    expect(screen.queryByText(/building your plan/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate full plan/i })).toBeEnabled()
    expect(api.calls()).toBe(1)
  })

  it('stops the loading state after a failure and lets the user try again', async () => {
    const user = userEvent.setup()
    const api = slowApi()
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    api.failNext()
    await user.click(screen.getByRole('button', { name: /generate full plan/i }))
    api.release()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/had a problem/i)
    expect(screen.queryByText(/building your plan/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate full plan/i })).toBeEnabled()
    api.succeedNext()
    await user.click(within(alert).getByRole('button', { name: /try again/i }))
    api.release()
    expect(await screen.findByRole('region', { name: /review proposed changes/i })).toBeInTheDocument()
    expect(api.calls()).toBe(2)
  })
})

describe('AI revisions that fail', () => {
  it('keep the previous plan, its history and the user’s own data untouched', async () => {
    const user = userEvent.setup()
    const api = slowApi()
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    await user.click(screen.getByRole('button', { name: /generate full plan/i }))
    api.release()
    await screen.findByRole('region', { name: /review proposed changes/i })
    await user.click(screen.getByRole('button', { name: /apply changes/i }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /confirm and apply/i }))
    await waitFor(() => expect(wedding().aiPlan).toBeDefined())
    const saved = JSON.stringify(wedding())
    expect(wedding().revisions).toHaveLength(1)

    api.failNext()
    await user.click(screen.getByRole('button', { name: 'Revise budget' }))
    api.release()
    expect(await screen.findByRole('alert')).toHaveTextContent(/has not been changed/i)
    expect(JSON.stringify(wedding())).toBe(saved)
    expect(screen.getByRole('heading', { name: /current ai plan/i })).toBeInTheDocument()
  })

  it('never applies a preview without the confirmation dialog, and cancelling the dialog changes nothing', async () => {
    const user = userEvent.setup()
    const api = slowApi()
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    const before = JSON.stringify(wedding())
    await user.click(screen.getByRole('button', { name: /generate full plan/i }))
    api.release()
    await screen.findByRole('region', { name: /review proposed changes/i })
    await user.click(screen.getByRole('button', { name: /apply changes/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))
    expect(JSON.stringify(wedding())).toBe(before)
  })
})

describe('assistant input', () => {
  it('does not send an empty or whitespace-only message', async () => {
    const user = userEvent.setup()
    slowApi()
    renderApp('#/app/ai')
    await screen.findByText(/Demo mode\./)
    const send = screen.getByRole('button', { name: /^send$/i })
    expect(send).toBeDisabled()
    await user.type(screen.getByLabelText(/message to the assistant/i), '    ')
    expect(send).toBeDisabled()
  })
})
