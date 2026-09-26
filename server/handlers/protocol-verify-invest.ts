import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken, payHubErrorStatus } from "../payHubCore.js";
import { verifyAndRecordOnChainInvest } from "../protocolOnChainVerify.js";

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
    const fundId = parseInt(String(body.fundId ?? ""), 10);
    const positionId =
      body.positionId != null ? parseInt(String(body.positionId), 10) : undefined;

    if (!refId) return res.status(400).json({ error: "Missing refId" });
    if (!txHash) return res.status(400).json({ error: "Missing txHash" });
    if (!walletAddress) return res.status(400).json({ error: "Missing walletAddress" });
    if (!Number.isFinite(fundId) || fundId < 1) {
      return res.status(400).json({ error: "Invalid fundId" });
    }

    const result = await verifyAndRecordOnChainInvest({
      uid: decoded.uid,
      refId,
      txHash,
      walletAddress,
      fundId,
      positionId: Number.isFinite(positionId) ? positionId : undefined,
    });

    return res.status(200).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = payHubErrorStatus(msg);
    return res.status(status).json({ error: msg });
  }
}
