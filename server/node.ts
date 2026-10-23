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
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('referrer-policy', 'no-referrer')
  for (const [k, v] of Object.entries(r.headers ?? {})) res.setHeader(k, v)
  res.end(JSON.stringify(r.body))
}

const header = (req: NodeReq, name: string): string | undefined => {
  const v = req.headers[name]
  return Array.isArray(v) ? v[0] : v
}

/**
 * Browsers attach an Origin header to cross-site requests. The API is only meant for this app's own pages, so a
 * request from a different site (which could burn the AI quota) is refused. Requests without Origin (curl, tests) pass.
 */
export function isCrossOrigin(req: NodeReq): boolean {
  const origin = header(req, 'origin')
  if (!origin) return header(req, 'sec-fetch-site') === 'cross-site'
  try {
    return new URL(origin).host !== header(req, 'host')
  } catch {
    return true
  }
}

/** Which endpoint a request targets. */
export type Route = 'plan' | 'assistant' | 'status'

export async function handleNode(route: Route, req: NodeReq, res: NodeRes, env: ServerEnv, body?: unknown): Promise<void> {
  if (route === 'status') {
    if (req.method !== 'GET') return send(res, { status: 405, body: { error: { kind: 'method_not_allowed', message: 'Use GET.' } }, headers: { allow: 'GET' } })
    return send(res, statusHandler(env))
  }
  if (req.method !== 'POST') return send(res, { status: 405, body: { error: { kind: 'method_not_allowed', message: 'Use POST.' } }, headers: { allow: 'POST' } })
  if (isCrossOrigin(req)) return send(res, { status: 403, body: { error: { kind: 'invalid_request', message: 'Requests from other sites are not allowed.' } } })
  if (!header(req, 'content-type')?.toLowerCase().startsWith('application/json')) {
    return send(res, { status: 415, body: { error: { kind: 'invalid_request', message: 'Send the request as JSON.' } } })
  }
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
