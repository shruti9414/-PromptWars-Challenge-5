import type { z } from 'zod'
import { callStructured as callAnthropic } from './anthropic'
import type { CallOptions, ProviderFailure, ProviderSuccess } from './anthropic'
import { callDeepSeek, callOpenAI } from './openai'

export type Provider = 'anthropic' | 'openai' | 'deepseek'

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-4.1',
  deepseek: 'deepseek-chat',
}

/** Sends one structured request to the configured provider. Both providers return the same validated shape. */
export function callProvider<S extends z.ZodType>(provider: Provider, o: CallOptions<S>): Promise<ProviderSuccess<z.infer<S>> | ProviderFailure> {
  if (provider === 'openai') return callOpenAI(o)
  if (provider === 'deepseek') return callDeepSeek(o)
  return callAnthropic(o)
}
