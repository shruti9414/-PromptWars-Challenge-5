import { handleNode, readEnv } from '../server/node'
import type { NodeReq, NodeRes } from '../server/node'

/** Vercel Function: POST /api/plan. The API key is read from the server environment only. */
export default async function handler(req: NodeReq, res: NodeRes) {
  await handleNode('plan', req, res, readEnv(process.env))
}
