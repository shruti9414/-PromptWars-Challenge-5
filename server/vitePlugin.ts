import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { handleNode, readEnv } from './node'
import type { NodeReq, NodeRes, Route } from './node'

const ROUTES: Record<string, Route> = { '/api/plan': 'plan', '/api/assistant': 'assistant', '/api/status': 'status' }

/**
 * Serves the same handlers as the Vercel functions during `vite dev` and `vite preview`, so the
 * AI features work locally with just a `.env.local` file. Nothing here is part of the browser bundle.
 */
export function aiApiPlugin(): Plugin {
  let env = readEnv({})
  const middleware = (req: NodeReq & { on: (e: string, cb: (c?: Buffer) => void) => void }, res: NodeRes, next: () => void) => {
    const route = ROUTES[(req.url ?? '').split('?')[0] ?? '']
    if (!route) return next()
    if (req.method !== 'POST') return void handleNode(route, req, res, env)
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c) => {
      if (!c) return
      size += c.length
      if (size <= 64_000) chunks.push(c)
    })
    req.on('end', () => {
      // Oversized bodies are passed on as an over-limit string so the handler answers 413.
      const text = size > 64_000 ? 'x'.repeat(30_000) : Buffer.concat(chunks).toString('utf8')
      void handleNode(route, req, res, env, text)
    })
  }
  return {
    name: 'gatherly-ai-api',
    configResolved(config) {
      env = readEnv(loadEnv(config.mode, config.envDir || process.cwd(), ''))
    },
    configureServer(server) {
      server.middlewares.use(middleware as never)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware as never)
    },
  }
}
