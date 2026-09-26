import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken, payHubErrorStatus } from "../payHubCore.js";
import { runReferralAutoRewardEngine, getUserReferralStats } from "../referralCore.js";
import { assertReferralUsageOpen } from "../referralProgramGate.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const gate = await assertReferralUsageOpen();
    if (!gate.ok) return res.status(403).json({ error: gate.error });

    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const engine = await runReferralAutoRewardEngine(decoded.uid);
    const stats = await getUserReferralStats(decoded.uid, decoded.email);
    return res.status(200).json({ ...engine, stats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(payHubErrorStatus(msg)).json({ error: msg });
  }
}
