export interface Limiter {
  /** Returns 0 when the request is allowed, otherwise the number of seconds to wait. */
  check(key: string, now?: number): number
}

/**
 * Fixed-window, in-memory limiter. On serverless platforms each instance keeps its own counters, so this is
 * a best-effort guard against accidental floods, not a security boundary. A shared store (Phase 3) would harden it.
 */
export function createLimiter(max: number, windowMs: number): Limiter {
  const hits = new Map<string, { count: number; resetAt: number }>()
  return {
    check(key, now = Date.now()) {
      if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k)
      const entry = hits.get(key)
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs })
        return 0
      }
      if (entry.count >= max) return Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
      entry.count += 1
      return 0
    },
  }
}
