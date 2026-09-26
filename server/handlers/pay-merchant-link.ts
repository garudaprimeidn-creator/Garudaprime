import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken, payHubErrorStatus } from "../payHubCore.js";
import { linkMerchantOwnerAndMigrate } from "../merchantLedgerCore.js";
import { getPayLedger } from "../payLedgerCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = req.body ?? {};
    const merchantId = String(body.merchantId ?? "").trim();
    if (!merchantId) {
      return res.status(400).json({ error: "Missing merchantId" });
    }

    const linked = await linkMerchantOwnerAndMigrate(merchantId, decoded.uid);
    const ledger = await getPayLedger(decoded.uid);
    return res.status(200).json({ ok: true, ...linked, ledger });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(payHubErrorStatus(msg)).json({ error: msg });
  }
}
