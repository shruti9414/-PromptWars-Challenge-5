import type { z } from 'zod'
import { toToolSchema } from '../src/ai/schema'
import type { CallOptions, ProviderFailure, ProviderSuccess } from './anthropic'
import { conformToLimits, extractFirstJsonObject } from './jsonRepair'

interface Flavor {
  url: string
  /** OpenAI's newer models want max_completion_tokens; OpenAI-compatible APIs such as DeepSeek use max_tokens. */
  tokenParam: 'max_completion_tokens' | 'max_tokens'
  /**
   * 'tools' forces a function call. 'json' asks for a JSON object with the schema in the prompt: deepseek-chat
   * sometimes writes invalid JSON inside tool calls, while its JSON mode is reliably parseable.
   */
  mode: 'tools' | 'json'
}
const OPENAI: Flavor = { url: 'https://api.openai.com/v1/chat/completions', tokenParam: 'max_completion_tokens', mode: 'tools' }
const DEEPSEEK: Flavor = { url: 'https://api.deepseek.com/chat/completions', tokenParam: 'max_tokens', mode: 'json' }

interface ChatResponse {
  choices?: { finish_reason?: string; message?: { content?: string | null; tool_calls?: { type?: string; function?: { name?: string; arguments?: string } }[] } }[]
}

/**
 * Calls the OpenAI Chat Completions API with one forced function call, so the model must answer with JSON
 * for `schema`. The arguments are parsed and validated with Zod again: the model's output is never trusted as-is.
 * The API key is only ever read here, on the server. Provider error bodies are never forwarded.
 */
/** Tells a JSON-mode model what to return. The word "JSON" must appear in the prompt for JSON mode to work. */
function jsonInstruction(o: CallOptions<z.ZodType>): string {
  return `${o.toolDescription} Respond with exactly one JSON object and nothing else (no markdown, no commentary) that satisfies this JSON Schema:
${JSON.stringify(toToolSchema(o.schema))}`
}

export const callOpenAI = <S extends z.ZodType>(o: CallOptions<S>) => callChatCompletions(o, OPENAI)
/** DeepSeek's API follows the same chat-completions and function-calling format. */
export async function callDeepSeek<S extends z.ZodType>(o: CallOptions<S>): Promise<ProviderSuccess<z.infer<S>> | ProviderFailure> {
  const started = Date.now()
  const first = await callChatCompletions(o, DEEPSEEK)
  if (first.ok || first.kind !== 'invalid_output') return first
  // JSON-mode output is occasionally malformed or off-schema. Retry once, but only inside the original time budget,
  // so the browser's own timeout is never exceeded.
  const left = o.timeoutMs - (Date.now() - started)
  return left >= 8000 ? callChatCompletions({ ...o, timeoutMs: left }, DEEPSEEK) : first
}

async function callChatCompletions<S extends z.ZodType>(o: CallOptions<S>, flavor: Flavor): Promise<ProviderSuccess<z.infer<S>> | ProviderFailure> {
  const doFetch = o.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), o.timeoutMs)
  try {
    const res = await doFetch(flavor.url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${o.apiKey}` },
      body: JSON.stringify({
        model: o.model,
        [flavor.tokenParam]: o.maxTokens,
        messages: [
          { role: 'system', content: flavor.mode === 'json' ? `${o.system}

${jsonInstruction(o)}` : o.system },
          { role: 'user', content: o.user },
        ],
        ...(flavor.mode === 'json'
          ? { response_format: { type: 'json_object' } }
          : {
              tools: [{ type: 'function', function: { name: o.toolName, description: o.toolDescription, parameters: toToolSchema(o.schema) } }],
              tool_choice: { type: 'function', function: { name: o.toolName } },
            }),
      }),
    })

    if (res.status === 429) {
      // Only the machine-readable error code is inspected; the provider's message is never forwarded.
      const code = await res.clone().json().then((j: { error?: { code?: string } }) => j?.error?.code, () => undefined)
      if (code === 'insufficient_quota' || code === 'credit_balance_exhausted') {
        return { ok: false, kind: 'provider_error', message: 'The AI account has no credits left. Add credits in the provider billing settings, then try again.' }
      }
      const retryAfter = Number(res.headers.get('retry-after'))
      return { ok: false, kind: 'rate_limited', message: 'The AI service is busy or the account quota is used up. Please try again shortly.', retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 20 }
    }
    if (!res.ok) {
      // 402 is DeepSeek's "insufficient balance".
      if (res.status === 402) return { ok: false, kind: 'provider_error', message: 'The AI account has no credits left. Add credits in the provider billing settings, then try again.' }
      if (res.status === 401 || res.status === 403) return { ok: false, kind: 'provider_error', message: 'The AI service rejected the server credentials. Check the API key configuration.' }
      if (res.status === 404) return { ok: false, kind: 'provider_error', message: 'The configured AI model is not available for this account. Check AI_MODEL.' }
      return { ok: false, kind: 'provider_error', message: 'The AI service had a problem. Please try again.' }
    }

    let body: ChatResponse
    try {
      body = (await res.json()) as ChatResponse
    } catch {
      return { ok: false, kind: 'invalid_output', message: 'The AI response could not be read. Please try again.' }
    }
    const choice = body.choices?.[0]
    if (choice?.finish_reason === 'length') return { ok: false, kind: 'invalid_output', message: 'The AI response was cut off. Please try again.' }
    const call = choice?.message?.tool_calls?.find((c) => c.type === 'function' && c.function?.name === o.toolName)
    const raw = flavor.mode === 'json' ? choice?.message?.content : call?.function?.arguments
    if (!raw) return { ok: false, kind: 'invalid_output', message: 'The AI did not return a structured plan. Please try again.' }

    let input: unknown
    try {
      // JSON-mode models can add text after the object or overshoot a length limit; tool calls are already exact.
      input = flavor.mode === 'json' ? conformToLimits(toToolSchema(o.schema), extractFirstJsonObject(raw)) : JSON.parse(raw)
    } catch {
      return { ok: false, kind: 'invalid_output', message: 'The AI returned a plan in an unexpected format. Please try again.' }
    }
    const parsed = o.schema.safeParse(input)
    if (!parsed.success) return { ok: false, kind: 'invalid_output', message: 'The AI returned a plan in an unexpected format. Please try again.' }
    return { ok: true, data: parsed.data }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return { ok: false, kind: 'timeout', message: 'The AI took too long to respond. Please try again.' }
    return { ok: false, kind: 'provider_error', message: 'Could not reach the AI service. Please try again.' }
  } finally {
    clearTimeout(timer)
  }
}
