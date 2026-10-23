import { handleNode, readEnv } from '../server/node'
import type { NodeReq, NodeRes } from '../server/node'

/** Vercel Function: POST /api/assistant. */
export default async function handler(req: NodeReq, res: NodeRes) {
  await handleNode('assistant', req, res, readEnv(process.env))
}
