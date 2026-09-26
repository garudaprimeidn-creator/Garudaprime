import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken, payHubErrorStatus } from "../payHubCore.js";
import { assertReferralUsageOpen } from "../referralProgramGate.js";
import { bindReferralCode } from "../referralCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const gate = await assertReferralUsageOpen();
    if (!gate.ok) return res.status(403).json({ error: gate.error });

    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const code = String(req.body?.code ?? "").trim();
    if (!code) return res.status(400).json({ error: "Missing referral code" });

    const result = await bindReferralCode(decoded.uid, code);
    if (!result.ok) return res.status(400).json({ error: result.error ?? "Bind failed" });
    return res.status(200).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(payHubErrorStatus(msg)).json({ error: msg });
  }
}
