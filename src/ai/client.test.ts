import { describe, expect, it } from 'vitest'
import { AiError, getAiStatus, requestAssistant, requestPlan } from './client'
import { demoFullPlan } from './demo'
import type { AiContext } from './schema'

const TODAY = '2026-10-23'
const ctx: AiContext = {
  eventType: 'community', date: '2026-12-20', location: 'Pune', guestCount: 200, budget: 300_000, currency: 'INR', theme: 'Festival Bright',
  preferences: [], venueStatus: 'not-started', priorities: [], flexibility: 'moderate',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const req = { context: ctx, section: 'full' as const }
const err = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as AiError
  }
  throw new Error('expected a failure')
}

describe('requestPlan', () => {
  it('returns a validated plan', async () => {
    const patch = demoFullPlan(ctx, TODAY)
    const res = await requestPlan(req, { fetchImpl: (async () => json({ source: 'demo', patch })) as never })
    expect(res.source).toBe('demo')
    expect(res.patch.timeline!.length).toBeGreaterThan(3)
  })

  it('rejects a response that does not match the schema, so bad AI output never reaches the UI', async () => {
    const e = await err(requestPlan(req, { fetchImpl: (async () => json({ source: 'live', patch: { budget: { lines: 'many' } } })) as never }))
    expect(e).toBeInstanceOf(AiError)
    expect(e.kind).toBe('invalid_output')
    expect(e.retryable).toBe(true)
  })

  it('classifies a network failure and keeps it retryable', async () => {
    const e = await err(requestPlan(req, { fetchImpl: (async () => { throw new TypeError('Failed to fetch') }) as never }))
    expect(e.kind).toBe('network')
    expect(e.retryable).toBe(true)
  })

  it('times out when the service hangs', async () => {
    const hang = ((_: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' })))
      })) as unknown as typeof fetch
    const e = await err(requestPlan(req, { fetchImpl: hang, timeoutMs: 20 }))
    expect(e.kind).toBe('timeout')
    expect(e.message).toMatch(/unchanged/)
  })

  it('surfaces rate limits with the wait time', async () => {
    const e = await err(requestPlan(req, { fetchImpl: (async () => json({ error: { kind: 'rate_limited', message: 'Too many requests.', retryAfter: 17 } }, 429)) as never }))
    expect(e).toMatchObject({ kind: 'rate_limited', retryAfter: 17 })
  })

  it('maps server error kinds', async () => {
    const e1 = await err(requestPlan(req, { fetchImpl: (async () => json({ error: { kind: 'provider_error', message: 'Down.' } }, 502)) as never }))
    expect(e1.kind).toBe('server')
    const e2 = await err(requestPlan(req, { fetchImpl: (async () => json({ error: { kind: 'invalid_request', message: 'Bad.' } }, 400)) as never }))
    expect(e2.kind).toBe('invalid_request')
    expect(e2.retryable).toBe(false)
  })

  it('handles unreadable or unexpected error bodies', async () => {
    const e1 = await err(requestPlan(req, { fetchImpl: (async () => new Response('<html>Bad gateway</html>', { status: 502 })) as never }))
    expect(e1.kind).toBe('server')
    const e2 = await err(requestPlan(req, { fetchImpl: (async () => json({ nope: true }, 500)) as never }))
    expect(e2.kind).toBe('server')
  })

  it('stops when the caller cancels', async () => {
    const c = new AbortController()
    const hang = ((_: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' }))))) as unknown as typeof fetch
    const p = err(requestPlan(req, { fetchImpl: hang, signal: c.signal }))
    c.abort()
    expect((await p).message).toMatch(/cancelled/)
  })
})

describe('requestAssistant', () => {
  it('validates the reply envelope', async () => {
    const ok = { source: 'live', model: 'm', reply: { reply: 'Hi', known: [], assumptions: [], clarifyingQuestions: [] } }
    const r = await requestAssistant({ context: ctx, current: { expenses: [], tasks: [], vendors: [] }, message: 'hi', history: [] }, { fetchImpl: (async () => json(ok)) as never })
    expect(r.reply.reply).toBe('Hi')
    const e = await err(requestAssistant({ context: ctx, current: { expenses: [], tasks: [], vendors: [] }, message: 'hi', history: [] }, { fetchImpl: (async () => json({ source: 'live', reply: { reply: 5 } })) as never }))
    expect(e.kind).toBe('invalid_output')
  })
})

describe('getAiStatus', () => {
  it('reports live, demo and unreachable', async () => {
    expect(await getAiStatus({ fetchImpl: (async () => json({ live: true, model: 'm' })) as never })).toEqual({ mode: 'live', model: 'm' })
    expect(await getAiStatus({ fetchImpl: (async () => json({ live: false })) as never })).toEqual({ mode: 'demo', model: undefined })
    expect((await getAiStatus({ fetchImpl: (async () => { throw new Error('offline') }) as never })).mode).toBe('unreachable')
    expect((await getAiStatus({ fetchImpl: (async () => new Response('<html>', { status: 404 })) as never })).mode).toBe('unreachable')
    expect((await getAiStatus({ fetchImpl: (async () => json({ unexpected: 1 })) as never })).mode).toBe('unreachable')
  })
})

