import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken, payHubErrorStatus } from "../payHubCore.js";
import { getUserReferralStats } from "../referralCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const stats = await getUserReferralStats(decoded.uid, decoded.email);
    return res.status(200).json(stats);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(payHubErrorStatus(msg)).json({ error: msg });
  }
}
