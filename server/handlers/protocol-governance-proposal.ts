import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import {
  governanceOnChainErrorStatus,
  relayUserGovernanceProposal,
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
    const body = (req.body ?? {}) as { proposalId?: string; title?: string; durationSec?: number };
    const proposalId = String(body.proposalId ?? "").trim();
    const title = String(body.title ?? "").trim();
    if (!proposalId || !title) {
      return res.status(400).json({ error: "proposalId and title required" });
    }

    const result = await relayUserGovernanceProposal({
      proposalId,
      title,
      durationSec: typeof body.durationSec === "number" ? body.durationSec : undefined,
    });

    return res.status(200).json({ ok: true, uid: decoded.uid, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(governanceOnChainErrorStatus(msg)).json({ error: msg });
  }
}
