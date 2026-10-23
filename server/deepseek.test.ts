import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { demoFullPlan } from '../src/ai/demo'
import type { AiContext } from '../src/ai/schema'
import { planHandler, statusHandler } from './handlers'
import { conformToLimits, extractFirstJsonObject } from './jsonRepair'
import { readEnv } from './node'
import { callDeepSeek } from './openai'
import { createLimiter } from './rateLimit'

const KEY = 'sk-deepseek-TEST-not-a-real-key'
const ctx: AiContext = {
  eventType: 'birthday', date: '2026-12-20', location: 'Pune', guestCount: 60, budget: 250_000, currency: 'INR', theme: 'Neon Night',
  preferences: ['DJ'], venueStatus: 'shortlisting', priorities: ['Music & entertainment'], flexibility: 'moderate',
}
const chat = (content: string, finish = 'stop') => new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content } }] }), { status: 200 })
const schema = z.strictObject({ title: z.string().max(10), tags: z.array(z.string().max(5)).max(2) })
const call = (fetchImpl: typeof fetch) =>
  callDeepSeek({ apiKey: KEY, model: 'deepseek-chat', system: 'sys', user: 'usr', toolName: 'submit', toolDescription: 'Submit the thing.', schema, maxTokens: 100, timeoutMs: 1000, fetchImpl })

describe('readEnv with DeepSeek', () => {
  it('uses DEEPSEEK_API_KEY and DEEPSEEK_MODEL', () => {
    expect(readEnv({ DEEPSEEK_API_KEY: KEY, DEEPSEEK_MODEL: 'deepseek-reasoner' })).toEqual({ apiKey: KEY, provider: 'deepseek', model: 'deepseek-reasoner' })
    expect(readEnv({ DEEPSEEK_API_KEY: KEY }).model).toBeUndefined()
    expect(statusHandler({ apiKey: KEY, provider: 'deepseek' }).body).toEqual({ live: true, model: 'deepseek-chat' })
  })
  it('AI_PROVIDER picks it when several keys exist; AI_MODEL beats DEEPSEEK_MODEL', () => {
    const all = { ANTHROPIC_API_KEY: 'sk-ant-x', OPENAI_API_KEY: 'sk-proj-y', DEEPSEEK_API_KEY: KEY }
    expect(readEnv(all).provider).toBe('anthropic')
    expect(readEnv({ ...all, AI_PROVIDER: 'deepseek', AI_MODEL: 'm1', DEEPSEEK_MODEL: 'm2' })).toMatchObject({ provider: 'deepseek', model: 'm1' })
    expect(readEnv({ OPENAI_API_KEY: 'sk-proj-y', DEEPSEEK_API_KEY: KEY }).provider).toBe('openai')
    expect(readEnv({ AI_PROVIDER: 'deepseek', OPENAI_API_KEY: 'sk-proj-y' }).apiKey).toBeUndefined()
  })
})

describe('DeepSeek adapter', () => {
  it('calls the DeepSeek endpoint in JSON mode with the schema in the prompt and no tool call', async () => {
    const fetchImpl = vi.fn(async () => chat('{"title":"ok","tags":["a"]}'))
    expect(await call(fetchImpl as never)).toEqual({ ok: true, data: { title: 'ok', tags: ['a'] } })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`)
    const body = JSON.parse(init.body as string)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.tools).toBeUndefined()
    expect(body.max_tokens).toBe(100)
    expect(body.max_completion_tokens).toBeUndefined()
    expect(body.messages[0].content).toMatch(/JSON/)
    expect(body.messages[0].content).toContain('"maxLength":10')
    expect(JSON.stringify(body)).not.toContain(KEY)
  })

  it('accepts JSON followed by extra text, and trims over-long lists and texts', async () => {
    const raw = '```json\n{"title":"a very long title here","tags":["abcdefgh","b","c"]}\n```\n{"extra": true} done'
    const out = await call((async () => chat(raw)) as never)
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.data.tags).toEqual(['abcd…', 'b'])
      expect(out.data.title.length).toBeLessThanOrEqual(10)
    }
  })

  it('still rejects output that is wrong in other ways', async () => {
    const kinds = async (r: Response) => ((await call((async () => r) as never)) as { kind?: string }).kind
    expect(await kinds(chat('{"title":5,"tags":[]}'))).toBe('invalid_output')
    expect(await kinds(chat('{"title":"x"}'))).toBe('invalid_output')
    expect(await kinds(chat('{"title":"x","tags":[],"surprise":1}'))).toBe('invalid_output')
    expect(await kinds(chat('no json here'))).toBe('invalid_output')
    expect(await kinds(chat('{"title":"x","tags":[]', 'length'))).toBe('invalid_output')
    expect(await kinds(chat(''))).toBe('invalid_output')
  })

  it('retries once when the first answer is unusable, and gives up after the second', async () => {
    const big = (fetchImpl: typeof fetch) => callDeepSeek({ apiKey: KEY, model: 'm', system: 's', user: 'u', toolName: 't', toolDescription: 'd', schema, maxTokens: 10, timeoutMs: 30_000, fetchImpl })
    const flaky = vi.fn().mockResolvedValueOnce(chat('{"title":5,"tags":[]}')).mockResolvedValueOnce(chat('{"title":"ok","tags":[]}'))
    expect(await big(flaky as never)).toEqual({ ok: true, data: { title: 'ok', tags: [] } })
    expect(flaky).toHaveBeenCalledTimes(2)
    const bad = vi.fn(async () => chat('nope'))
    expect(await big(bad as never)).toMatchObject({ ok: false, kind: 'invalid_output' })
    expect(bad).toHaveBeenCalledTimes(2)
    const down = vi.fn(async () => new Response('{}', { status: 500 }))
    await big(down as never)
    expect(down).toHaveBeenCalledTimes(1)
  })

  it('maps credentials, balance and rate-limit failures to safe messages', async () => {
    const msg = async (status: number, headers: Record<string, string> = {}) => {
      const r = (await call((async () => new Response('{"error":{"message":"secret details"}}', { status, headers })) as never)) as { message?: string; kind?: string }
      expect(r.message).not.toContain('secret')
      return r
    }
    expect((await msg(401)).message).toMatch(/rejected the server credentials/)
    expect((await msg(402)).message).toMatch(/no credits left/)
    expect(await msg(429, { 'retry-after': '7' })).toMatchObject({ kind: 'rate_limited' })
    expect((await msg(500)).message).toMatch(/had a problem/)
  })

  it('works end to end through the plan handler and labels the result with the DeepSeek model', async () => {
    const full = demoFullPlan(ctx, '2026-10-23')
    const r = await planHandler({ context: ctx, section: 'full' }, { today: '2026-10-23', apiKey: KEY, provider: 'deepseek', fetchImpl: (async () => chat(`${JSON.stringify(full)}\n`)) as never }, createLimiter(100, 1000), 'ip')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ source: 'live', model: 'deepseek-chat' })
    expect(JSON.stringify(r.body)).not.toContain(KEY)
  })
})

describe('jsonRepair', () => {
  it('finds the first complete object, ignoring braces inside strings and trailing junk', () => {
    expect(extractFirstJsonObject('prefix {"a":"}{","b":{"c":1}} trailing {"x":1}')).toEqual({ a: '}{', b: { c: 1 } })
    expect(extractFirstJsonObject('{"q":"say \\"hi\\" {"}')).toEqual({ q: 'say "hi" {' })
    expect(() => extractFirstJsonObject('nothing')).toThrow()
    expect(() => extractFirstJsonObject('{"a":1')).toThrow()
  })
  it('only shortens lists and texts that exceed the schema limits', () => {
    const s = { type: 'object', properties: { a: { type: 'array', maxItems: 2, items: { type: 'string', maxLength: 6 } }, n: { type: 'number' } } }
    expect(conformToLimits(s, { a: ['one', 'two', 'three'], n: 99, other: 'x' })).toEqual({ a: ['one', 'two'], n: 99, other: 'x' })
    expect(conformToLimits(s, { a: ['abcdefghij'] })).toEqual({ a: ['abcde…'] })
    expect(conformToLimits(s, { a: 'not a list' })).toEqual({ a: 'not a list' })
  })
})
