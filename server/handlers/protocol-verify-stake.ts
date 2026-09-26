import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken, payHubErrorStatus } from "../payHubCore.js";
import { verifyAndRecordOnChainStake } from "../protocolOnChainVerify.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = req.body ?? {};
    const refId = String(body.refId ?? "").trim();
    const txHash = String(body.txHash ?? "").trim();
    const walletAddress = String(body.walletAddress ?? "").trim();
    const stakeId = body.stakeId != null ? parseInt(String(body.stakeId), 10) : undefined;

    if (!refId) return res.status(400).json({ error: "Missing refId" });
    if (!txHash) return res.status(400).json({ error: "Missing txHash" });
    if (!walletAddress) return res.status(400).json({ error: "Missing walletAddress" });

    const result = await verifyAndRecordOnChainStake({
      uid: decoded.uid,
      refId,
      txHash,
      walletAddress,
      stakeId: Number.isFinite(stakeId) ? stakeId : undefined,
    });

    return res.status(200).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = payHubErrorStatus(msg);
    return res.status(status).json({ error: msg });
  }
}
