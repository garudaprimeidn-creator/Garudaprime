import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { isPayOpsAuthorized } from "../payCronAuth.js";
import {
  closeExpiredGovernanceProposals,
  governanceOnChainErrorStatus,
  relayGovernanceClose,
} from "../governanceOnChainCore.js";

/** POST, close one proposal or sweep expired (pay ops / cron auth). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  if (handleOptions(req.method, res, origin)) return;
  applyCors(res, origin);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isPayOpsAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = (req.body ?? {}) as { proposalId?: string; sweep?: boolean };
    if (body.sweep) {
      const result = await closeExpiredGovernanceProposals();
      return res.status(200).json({ ok: true, ...result });
    }

    const proposalId = String(body.proposalId ?? "").trim();
    if (!proposalId) {
      return res.status(400).json({ error: "proposalId or sweep required" });
    }

    const result = await relayGovernanceClose({
      proposalId,
      requireVotingEnded: false,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(governanceOnChainErrorStatus(msg)).json({ error: msg });
  }
}
