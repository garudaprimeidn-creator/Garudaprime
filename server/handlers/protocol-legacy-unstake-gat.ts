import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken, payHubErrorStatus } from "../payHubCore.js";
import { releaseLegacyStakePosition } from "../protocolLegacyPayout.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = req.body ?? {};
    const refId = String(body.refId ?? "").trim();
    const grossAmountGat = parseFloat(String(body.grossAmountGat ?? ""));
    const walletAddress = String(body.walletAddress ?? "").trim();

    if (!refId) return res.status(400).json({ error: "Missing refId" });
    if (!walletAddress) return res.status(400).json({ error: "Missing walletAddress" });
    if (!Number.isFinite(grossAmountGat) || grossAmountGat <= 0) {
      return res.status(400).json({ error: "Invalid grossAmountGat" });
    }

    const result = await releaseLegacyStakePosition({
      uid: decoded.uid,
      positionRefId: refId,
      grossAmountGat,
      walletAddress,
    });

    return res.status(200).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = payHubErrorStatus(msg);
    return res.status(status).json({ error: msg });
  }
}
