import type { z } from 'zod'
import { toToolSchema } from '../src/ai/schema'

export type ProviderErrorKind = 'timeout' | 'rate_limited' | 'provider_error' | 'invalid_output'

export interface ProviderFailure {
  ok: false
  kind: ProviderErrorKind
  message: string
  retryAfter?: number
}
export interface ProviderSuccess<T> { ok: true; data: T }

export interface CallOptions<S extends z.ZodType> {
  apiKey: string
  model: string
  system: string
  user: string
  toolName: string
  toolDescription: string
  schema: S
  maxTokens: number
  timeoutMs: number
  fetchImpl?: typeof fetch
}

const ENDPOINT = 'https://api.anthropic.com/v1/messages'

interface AnthropicBlock { type: string; name?: string; input?: unknown }
interface AnthropicResponse { content?: AnthropicBlock[]; stop_reason?: string }

/**
 * Calls the Anthropic Messages API with a single forced tool, so the model must answer with JSON that
 * matches `schema`. The result is validated again with Zod: the model's output is never trusted as-is.
 * The API key is only ever read here, on the server.
 */
export async function callStructured<S extends z.ZodType>(o: CallOptions<S>): Promise<ProviderSuccess<z.infer<S>> | ProviderFailure> {
  const doFetch = o.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), o.timeoutMs)
  try {
    const res = await doFetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': o.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: o.model,
        max_tokens: o.maxTokens,
        system: o.system,
        messages: [{ role: 'user', content: o.user }],
        tools: [{ name: o.toolName, description: o.toolDescription, input_schema: toToolSchema(o.schema) }],
        tool_choice: { type: 'tool', name: o.toolName },
      }),
    })

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'))
      return { ok: false, kind: 'rate_limited', message: 'The AI service is busy. Please try again shortly.', retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 20 }
    }
    if (!res.ok) {
      // Never forward provider error bodies: they can contain request details.
      return { ok: false, kind: 'provider_error', message: res.status === 401 || res.status === 403 ? 'The AI service rejected the server credentials. Check the API key configuration.' : 'The AI service had a problem. Please try again.' }
    }

    let body: AnthropicResponse
    try {
      body = (await res.json()) as AnthropicResponse
    } catch {
      return { ok: false, kind: 'invalid_output', message: 'The AI response could not be read. Please try again.' }
    }
    if (body.stop_reason === 'max_tokens') return { ok: false, kind: 'invalid_output', message: 'The AI response was cut off. Please try again.' }
    const block = body.content?.find((b) => b.type === 'tool_use' && b.name === o.toolName)
    if (!block) return { ok: false, kind: 'invalid_output', message: 'The AI did not return a structured plan. Please try again.' }

    const parsed = o.schema.safeParse(block.input)
    if (!parsed.success) return { ok: false, kind: 'invalid_output', message: 'The AI returned a plan in an unexpected format. Please try again.' }
    return { ok: true, data: parsed.data }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return { ok: false, kind: 'timeout', message: 'The AI took too long to respond. Please try again.' }
    return { ok: false, kind: 'provider_error', message: 'Could not reach the AI service. Please try again.' }
  } finally {
    clearTimeout(timer)
  }
}
