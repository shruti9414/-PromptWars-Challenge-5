import { useEffect, useState } from 'react'
import { getAiStatus } from '../../ai/client'
import type { AiMode } from '../../ai/client'

/** Asks the server whether live AI is configured. `null` while the first check is running. */
export function useAiStatus(): { mode: AiMode; model?: string } | null {
  const [status, setStatus] = useState<{ mode: AiMode; model?: string } | null>(null)
  useEffect(() => {
    let alive = true
    void getAiStatus().then((s) => alive && setStatus(s))
    return () => {
      alive = false
    }
  }, [])
  return status
}
