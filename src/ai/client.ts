import {
  AssistantResponseSchema,
  ErrorResponseSchema,
  PlanResponseSchema,
  StatusResponseSchema,
} from './schema'
import type { AssistantRequest, AssistantResponse, PlanRequest, PlanResponse } from './schema'

export type AiErrorKind =
  | 'timeout'
  | 'rate_limited'
  | 'network'
  | 'server'
  | 'invalid_output'
  | 'invalid_request'
  | 'payload_too_large'

/** Every failure the AI calls can produce, in a form the UI can explain and offer a retry for. */
export class AiError extends Error {
  kind: AiErrorKind
  retryAfter?: number
  constructor(kind: AiErrorKind, message: string, retryAfter?: number) {
    super(message)
    this.name = 'AiError'
    this.kind = kind
    this.retryAfter = retryAfter
  }
  /** Whether trying the same request again can reasonably succeed. */
  get retryable(): boolean {
    return this.kind !== 'invalid_request' && this.kind !== 'payload_too_large'
  }
}

export type AiMode = 'live' | 'demo' | 'unreachable'

export interface ClientOptions {
  fetchImpl?: typeof fetch
  /** Total time the browser waits before giving up. Slightly above the server's own timeout. */
  timeoutMs?: number
  signal?: AbortSignal
}

const SERVER_KINDS: Record<string, AiErrorKind> = {
  timeout: 'timeout',
  rate_limited: 'rate_limited',
  provider_error: 'server',
  invalid_output: 'invalid_output',
  invalid_request: 'invalid_request',
  payload_too_large: 'payload_too_large',
  method_not_allowed: 'server',
}

/** Reports whether live AI is configured. Never throws: an unreachable API means the offline demo is used. */
export async function getAiStatus(opts: ClientOptions = {}): Promise<{ mode: AiMode; model?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await (opts.fetchImpl ?? fetch)('/api/status', { signal: opts.signal ?? controller.signal })
    if (!res.ok) return { mode: 'unreachable' }
    const parsed = StatusResponseSchema.safeParse(await res.json())
    if (!parsed.success) return { mode: 'unreachable' }
    return { mode: parsed.data.live ? 'live' : 'demo', model: parsed.data.model }
  } catch {
    return { mode: 'unreachable' }
  } finally {
    clearTimeout(timer)
  }
}

async function post<T>(path: string, body: unknown, parse: (v: unknown) => T | null, opts: ClientOptions): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000)
  const abort = () => controller.abort()
  opts.signal?.addEventListener('abort', abort)
  let res: Response
  try {
    res = await (opts.fetchImpl ?? fetch)(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    if (opts.signal?.aborted) throw new AiError('network', 'The request was cancelled.')
    if (err instanceof Error && err.name === 'AbortError') throw new AiError('timeout', 'The AI took too long to respond. Your event details are unchanged; please try again.')
    throw new AiError('network', 'Could not reach the planning service. Check your connection and try again.')
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', abort)
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new AiError(res.ok ? 'invalid_output' : 'server', 'The planning service sent an unreadable response. Please try again.')
  }
  if (!res.ok) {
    const err = ErrorResponseSchema.safeParse(json)
    if (err.success) {
      const { kind, message, retryAfter } = err.data.error
      throw new AiError(SERVER_KINDS[kind] ?? 'server', message, retryAfter)
    }
    throw new AiError('server', 'The planning service had a problem. Please try again.')
  }
  const parsed = parse(json)
  if (!parsed) throw new AiError('invalid_output', 'The AI returned a plan in an unexpected format. Please try again.')
  return parsed
}

export function requestPlan(req: PlanRequest, opts: ClientOptions = {}): Promise<PlanResponse> {
  return post('/api/plan', req, (v) => {
    const r = PlanResponseSchema.safeParse(v)
    return r.success ? r.data : null
  }, opts)
}

export function requestAssistant(req: AssistantRequest, opts: ClientOptions = {}): Promise<AssistantResponse> {
  return post('/api/assistant', req, (v) => {
    const r = AssistantResponseSchema.safeParse(v)
    return r.success ? r.data : null
  }, opts)
}

