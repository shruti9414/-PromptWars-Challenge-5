import { z } from 'zod'
import { demoAssistant, demoSection } from '../src/ai/demo'
import {
  AssistantReplySchema,
  AssistantRequestSchema,
  PatchSchema,
  PlanRequestSchema,
  SECTION_SCHEMAS,
  FullPlanSchema,
} from '../src/ai/schema'
import type { ErrorKind } from '../src/ai/schema'
import { todayISO } from '../src/lib/dates'
import { callStructured } from './anthropic'
import { assistantPrompt, planPrompt, SYSTEM_PROMPT } from './prompts'
import type { Limiter } from './rateLimit'

export const MAX_BODY_BYTES = 24_000
export const DEFAULT_MODEL = 'claude-sonnet-5-5'

export interface ServerEnv {
  /** Read from the ANTHROPIC_API_KEY environment variable. Absent means demo mode. */
  apiKey?: string
  model?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  today?: string
}

export interface HandlerResult { status: number; body: unknown; headers?: Record<string, string> }

const fail = (status: number, kind: ErrorKind, message: string, extra: { retryAfter?: number } = {}): HandlerResult => ({
  status,
  body: { error: { kind, message, ...extra } },
  headers: extra.retryAfter ? { 'retry-after': String(extra.retryAfter) } : undefined,
})

const PROVIDER_STATUS: Record<string, [number, ErrorKind]> = {
  timeout: [504, 'timeout'],
  rate_limited: [429, 'rate_limited'],
  provider_error: [502, 'provider_error'],
  invalid_output: [502, 'invalid_output'],
}

function checkBody(raw: unknown): HandlerResult | null {
  let size = 0
  try {
    size = typeof raw === 'string' ? raw.length : JSON.stringify(raw ?? null).length
  } catch {
    return fail(400, 'invalid_request', 'The request could not be read.')
  }
  if (size > MAX_BODY_BYTES) return fail(413, 'payload_too_large', 'The request is too large.')
  return null
}

function parseJson(raw: unknown): { ok: true; value: unknown } | { ok: false } {
  if (typeof raw !== 'string') return { ok: true, value: raw }
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch {
    return { ok: false }
  }
}

const invalid = (err: z.ZodError) =>
  fail(400, 'invalid_request', `Invalid request: ${err.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'body'} ${i.message}`).join('; ')}`.slice(0, 380))

export function statusHandler(env: ServerEnv): HandlerResult {
  return { status: 200, body: env.apiKey ? { live: true, model: env.model ?? DEFAULT_MODEL } : { live: false } }
}

/** POST /api/plan: full plan or one section. Returns a validated patch; the app turns it into a reviewable proposal. */
export async function planHandler(raw: unknown, env: ServerEnv, limiter: Limiter, clientKey: string): Promise<HandlerResult> {
  const tooBig = checkBody(raw)
  if (tooBig) return tooBig
  const json = parseJson(raw)
  if (!json.ok) return fail(400, 'invalid_request', 'The request body is not valid JSON.')
  const parsed = PlanRequestSchema.safeParse(json.value)
  if (!parsed.success) return invalid(parsed.error)
  const wait = limiter.check(clientKey)
  if (wait) return fail(429, 'rate_limited', 'Too many requests. Please wait a moment.', { retryAfter: wait })

  const { context, section, current } = parsed.data
  const today = env.today ?? todayISO()

  if (!env.apiKey) return { status: 200, body: { source: 'demo', patch: demoSection(section, context, today) } }

  const model = env.model ?? DEFAULT_MODEL
  const schema = section === 'full' ? FullPlanSchema : SECTION_SCHEMAS[section]
  const result = await callStructured({
    apiKey: env.apiKey,
    model,
    system: SYSTEM_PROMPT,
    user: planPrompt(section, context, current, today),
    toolName: 'submit_event_plan',
    toolDescription: 'Submit the structured event plan.',
    schema,
    maxTokens: section === 'full' ? 8000 : 4500,
    timeoutMs: env.timeoutMs ?? 75_000,
    fetchImpl: env.fetchImpl,
  })
  if (!result.ok) {
    const [status, kind] = PROVIDER_STATUS[result.kind] ?? [502, 'provider_error']
    return fail(status, kind, result.message, { retryAfter: result.retryAfter })
  }
  // Section outputs also carry optional extras; reduce them to the shared patch shape.
  const patch = PatchSchema.safeParse(result.data)
  if (!patch.success) return fail(502, 'invalid_output', 'The AI returned a plan in an unexpected format. Please try again.')
  return { status: 200, body: { source: 'live', model, patch: patch.data } }
}

/** POST /api/assistant: contextual chat. */
export async function assistantHandler(raw: unknown, env: ServerEnv, limiter: Limiter, clientKey: string): Promise<HandlerResult> {
  const tooBig = checkBody(raw)
  if (tooBig) return tooBig
  const json = parseJson(raw)
  if (!json.ok) return fail(400, 'invalid_request', 'The request body is not valid JSON.')
  const parsed = AssistantRequestSchema.safeParse(json.value)
  if (!parsed.success) return invalid(parsed.error)
  const wait = limiter.check(clientKey)
  if (wait) return fail(429, 'rate_limited', 'Too many requests. Please wait a moment.', { retryAfter: wait })

  const req = parsed.data
  const today = env.today ?? todayISO()
  if (!env.apiKey) return { status: 200, body: { source: 'demo', reply: demoAssistant(req.message, req.context, req.current, today) } }

  const model = env.model ?? DEFAULT_MODEL
  const result = await callStructured({
    apiKey: env.apiKey,
    model,
    system: SYSTEM_PROMPT,
    user: assistantPrompt(req, today),
    toolName: 'reply_to_user',
    toolDescription: 'Reply to the user and optionally propose plan changes.',
    schema: AssistantReplySchema,
    maxTokens: 4500,
    timeoutMs: env.timeoutMs ?? 60_000,
    fetchImpl: env.fetchImpl,
  })
  if (!result.ok) {
    const [status, kind] = PROVIDER_STATUS[result.kind] ?? [502, 'provider_error']
    return fail(status, kind, result.message, { retryAfter: result.retryAfter })
  }
  return { status: 200, body: { source: 'live', model, reply: result.data } }
}

