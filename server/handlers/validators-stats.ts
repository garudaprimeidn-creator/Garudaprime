import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken, payHubErrorStatus } from "../payHubCore.js";
import { getUserValidatorStats } from "../validatorRewardsCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const stats = await getUserValidatorStats(decoded.uid);
    return res.status(200).json(stats);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(payHubErrorStatus(msg)).json({ error: msg });
  }
}
