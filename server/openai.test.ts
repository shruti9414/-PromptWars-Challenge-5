import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { demoFullPlan } from '../src/ai/demo'
import type { AiContext } from '../src/ai/schema'
import { assistantHandler, planHandler, statusHandler } from './handlers'
import { readEnv } from './node'
import { callOpenAI } from './openai'
import { createLimiter } from './rateLimit'

const TODAY = '2026-10-23'
const SECRET = 'sk-proj-TEST-not-a-real-key-0123456789'
const ctx: AiContext = {
  eventType: 'birthday', date: '2026-12-20', location: 'Pune', guestCount: 60, budget: 250_000, currency: 'INR', theme: 'Neon Night',
  preferences: ['DJ'], venueStatus: 'shortlisting', priorities: ['Music & entertainment'], flexibility: 'moderate',
}
const open = () => createLimiter(1000, 60_000)
const completion = (args: unknown, name = 'submit_event_plan', finish = 'tool_calls') =>
  new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { tool_calls: [{ type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } }] } }] }), { status: 200 })
const errorBody = (status: number, code: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { code, message: `details with ${SECRET}` } }), { status, headers })

const schema = z.object({ answer: z.string() })
const call = (fetchImpl: typeof fetch) =>
  callOpenAI({ apiKey: SECRET, model: 'gpt-test', system: 's', user: 'u', toolName: 'submit_event_plan', toolDescription: 'd', schema, maxTokens: 100, timeoutMs: 1000, fetchImpl })

describe('readEnv provider selection', () => {
  it('uses an OpenAI key for OpenAI and an sk-ant key for Anthropic', () => {
    expect(readEnv({ OPENAI_API_KEY: SECRET })).toMatchObject({ apiKey: SECRET, provider: 'openai' })
    expect(readEnv({ ANTHROPIC_API_KEY: 'sk-ant-abc' })).toMatchObject({ apiKey: 'sk-ant-abc', provider: 'anthropic' })
  })
  it('trims whitespace and surrounding quotes', () => {
    expect(readEnv({ OPENAI_API_KEY: `  "${SECRET}"  ` }).apiKey).toBe(SECRET)
  })
  it('never sends a key to the wrong provider: a mismatched key is ignored and demo mode is used', () => {
    expect(readEnv({ ANTHROPIC_API_KEY: SECRET }).apiKey).toBeUndefined()
    expect(readEnv({ OPENAI_API_KEY: 'sk-ant-abc' }).apiKey).toBeUndefined()
    expect(readEnv({ OPENAI_API_KEY: 'not-a-key' }).apiKey).toBeUndefined()
    expect(readEnv({}).apiKey).toBeUndefined()
    expect(readEnv({ OPENAI_API_KEY: '   ' }).apiKey).toBeUndefined()
  })
  it('prefers Anthropic when both are set, unless AI_PROVIDER says otherwise', () => {
    const both = { ANTHROPIC_API_KEY: 'sk-ant-abc', OPENAI_API_KEY: SECRET }
    expect(readEnv(both).provider).toBe('anthropic')
    expect(readEnv({ ...both, AI_PROVIDER: 'openai' }).provider).toBe('openai')
    expect(readEnv({ ...both, AI_PROVIDER: 'ANTHROPIC' }).provider).toBe('anthropic')
    expect(readEnv({ OPENAI_API_KEY: SECRET, AI_PROVIDER: 'anthropic' }).apiKey).toBeUndefined()
  })
  it('reports the provider default model, or AI_MODEL when set', () => {
    expect(statusHandler({ apiKey: SECRET, provider: 'openai' }).body).toEqual({ live: true, model: 'gpt-4.1' })
    expect(statusHandler({ apiKey: 'sk-ant-x' }).body).toEqual({ live: true, model: 'claude-sonnet-5-5' })
    expect(statusHandler({ apiKey: SECRET, provider: 'openai', model: 'gpt-4.1-mini' }).body).toEqual({ live: true, model: 'gpt-4.1-mini' })
  })
})

describe('OpenAI adapter', () => {
  it('sends a Bearer key and a forced function call, and returns validated arguments', async () => {
    const fetchImpl = vi.fn(async () => completion({ answer: 'hi' }))
    const out = await call(fetchImpl as never)
    expect(out).toEqual({ ok: true, data: { answer: 'hi' } })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe(`Bearer ${SECRET}`)
    expect(headers['x-api-key']).toBeUndefined()
    const body = JSON.parse(init.body as string)
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'submit_event_plan' } })
    expect(body.tools[0].function.parameters.type).toBe('object')
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user'])
    expect(JSON.stringify(body)).not.toContain(SECRET)
  })

  it.each([
    ['rejected credentials', () => errorBody(401, 'invalid_api_key'), /rejected the server credentials/],
    ['forbidden', () => errorBody(403, 'x'), /rejected the server credentials/],
    ['unknown model', () => errorBody(404, 'model_not_found'), /model is not available/],
    ['no credits', () => errorBody(429, 'credit_balance_exhausted'), /no credits left/],
    ['quota', () => errorBody(429, 'insufficient_quota'), /no credits left/],
    ['server error', () => errorBody(500, 'server_error'), /had a problem/],
  ])('maps %s to a safe message that never contains provider details or the key', async (_n, make, message) => {
    const out = await call((async () => make()) as never)
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.message).toMatch(message)
      expect(out.message).not.toContain('sk-')
      expect(out.message).not.toContain('details')
    }
  })

  it('treats a plain rate limit as retryable with a wait time', async () => {
    const out = await call((async () => errorBody(429, 'rate_limit_exceeded', { 'retry-after': '12' })) as never)
    expect(out).toMatchObject({ ok: false, kind: 'rate_limited', retryAfter: 12 })
  })

  it('rejects truncated, missing, unparsable and off-schema output', async () => {
    const kinds = async (r: Response) => ((await call((async () => r) as never)) as { kind?: string }).kind
    expect(await kinds(completion({ answer: 'x' }, 'submit_event_plan', 'length'))).toBe('invalid_output')
    expect(await kinds(completion({ answer: 'x' }, 'other_tool'))).toBe('invalid_output')
    expect(await kinds(completion('{not json'))).toBe('invalid_output')
    expect(await kinds(completion({ answer: 42 }))).toBe('invalid_output')
    expect(await kinds(new Response('{"choices":[]}', { status: 200 }))).toBe('invalid_output')
    expect(await kinds(new Response('nope', { status: 200 }))).toBe('invalid_output')
  })

  it('reports network failures and timeouts', async () => {
    expect(await call((async () => { throw new TypeError('fetch failed') }) as never)).toMatchObject({ kind: 'provider_error' })
    const hang = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))))) as never
    const out = await callOpenAI({ apiKey: SECRET, model: 'm', system: 's', user: 'u', toolName: 't', toolDescription: 'd', schema, maxTokens: 10, timeoutMs: 20, fetchImpl: hang })
    expect(out).toMatchObject({ ok: false, kind: 'timeout' })
  })
})

describe('handlers with the OpenAI provider', () => {
  const env = (fetchImpl: typeof fetch) => ({ today: TODAY, apiKey: SECRET, provider: 'openai' as const, fetchImpl })

  it('returns a live, validated plan labelled with the OpenAI model', async () => {
    const full = demoFullPlan(ctx, TODAY)
    const fetchImpl = vi.fn(async () => completion(full))
    const r = await planHandler({ context: ctx, section: 'full' }, env(fetchImpl as never), open(), 'ip')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ source: 'live', model: 'gpt-4.1' })
    expect(JSON.stringify(r.body)).not.toContain(SECRET)
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toContain('api.openai.com')
  })

  it('answers the assistant through OpenAI and rejects a malformed reply', async () => {
    const good = { reply: 'Here is an indoor backup plan.', known: [], assumptions: [], clarifyingQuestions: [] }
    const bad = { nothing: true }
    const request = { context: ctx, message: 'Suggest an indoor backup plan', current: { expenses: [], tasks: [], vendors: [] }, history: [] }
    const ok = await assistantHandler(request, env((async () => completion(good, 'reply_to_user')) as never), open(), 'ip')
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ source: 'live', model: 'gpt-4.1' })
    const rejected = await assistantHandler(request, env((async () => completion(bad, 'reply_to_user')) as never), open(), 'ip')
    expect(rejected.status).toBe(502)
    expect(JSON.stringify(rejected.body)).toMatch(/invalid_output/)
  })

  it('surfaces a credentials failure without leaking anything', async () => {
    const r = await planHandler({ context: ctx, section: 'full' }, env((async () => errorBody(401, 'invalid_api_key')) as never), open(), 'ip')
    expect(r.status).toBe(502)
    expect(JSON.stringify(r.body)).toMatch(/rejected the server credentials/)
    expect(JSON.stringify(r.body)).not.toContain('sk-')
  })
})
