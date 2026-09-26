import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import {
  governanceOnChainErrorStatus,
  relayUserGovernanceVote,
} from "../governanceOnChainCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  if (handleOptions(req.method, res, origin)) return;
  applyCors(res, origin);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = (req.body ?? {}) as { proposalId?: string; support?: boolean };
    const proposalId = String(body.proposalId ?? "").trim();
    if (!proposalId) {
      return res.status(400).json({ error: "proposalId required" });
    }
    if (typeof body.support !== "boolean") {
      return res.status(400).json({ error: "support boolean required" });
    }

    const result = await relayUserGovernanceVote({
      uid: decoded.uid,
      proposalId,
      support: body.support,
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(governanceOnChainErrorStatus(msg)).json({ error: msg });
  }
}
