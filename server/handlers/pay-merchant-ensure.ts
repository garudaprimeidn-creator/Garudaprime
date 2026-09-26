import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken, payHubErrorStatus } from "../payHubCore.js";
import { ensurePersonalMerchant } from "../merchantLedgerCore.js";
import { getPayLedger } from "../payLedgerCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = (req.body ?? {}) as { displayName?: string };
    const merchant = await ensurePersonalMerchant(
      decoded.uid,
      body.displayName ? String(body.displayName) : undefined,
    );
    const ledger = await getPayLedger(decoded.uid);
    return res.status(200).json({ ok: true, merchant, ledger });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(payHubErrorStatus(msg)).json({ error: msg });
  }
}
