import { handleNode, readEnv } from '../server/node'
import type { NodeReq, NodeRes } from '../server/node'

/** Vercel Function: GET /api/status. Reports whether live AI is configured, never the key itself. */
export default async function handler(req: NodeReq, res: NodeRes) {
  await handleNode('status', req, res, readEnv(process.env))
}
