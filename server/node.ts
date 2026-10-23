import { assistantHandler, planHandler, statusHandler } from './handlers'
import type { HandlerResult, ServerEnv } from './handlers'
import { createLimiter } from './rateLimit'

/** Minimal request/response shapes shared by Vercel functions and the Vite dev middleware. */
export interface NodeReq {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  socket?: { remoteAddress?: string }
}
export interface NodeRes {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string): void
}

const planLimiter = createLimiter(8, 60_000)
const assistantLimiter = createLimiter(20, 60_000)

export function readEnv(source: Record<string, string | undefined>): ServerEnv {
  const apiKey = source.ANTHROPIC_API_KEY?.trim()
  return { apiKey: apiKey || undefined, model: source.AI_MODEL?.trim() || undefined }
}

function clientKey(req: NodeReq): string {
  const fwd = req.headers['x-forwarded-for']
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
  return first || req.socket?.remoteAddress || 'unknown'
}

function send(res: NodeRes, r: HandlerResult) {
  res.statusCode = r.status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  for (const [k, v] of Object.entries(r.headers ?? {})) res.setHeader(k, v)
  res.end(JSON.stringify(r.body))
}

/** Which endpoint a request targets. */
export type Route = 'plan' | 'assistant' | 'status'

export async function handleNode(route: Route, req: NodeReq, res: NodeRes, env: ServerEnv, body?: unknown): Promise<void> {
  if (route === 'status') {
    if (req.method !== 'GET') return send(res, { status: 405, body: { error: { kind: 'method_not_allowed', message: 'Use GET.' } }, headers: { allow: 'GET' } })
    return send(res, statusHandler(env))
  }
  if (req.method !== 'POST') return send(res, { status: 405, body: { error: { kind: 'method_not_allowed', message: 'Use POST.' } }, headers: { allow: 'POST' } })
  const payload = body ?? req.body
  const key = clientKey(req)
  try {
    const result = route === 'plan' ? await planHandler(payload, env, planLimiter, key) : await assistantHandler(payload, env, assistantLimiter, key)
    send(res, result)
  } catch {
    // Never leak internals (or the API key) in an error response.
    send(res, { status: 500, body: { error: { kind: 'provider_error', message: 'Something went wrong on the server. Please try again.' } } })
  }
}
