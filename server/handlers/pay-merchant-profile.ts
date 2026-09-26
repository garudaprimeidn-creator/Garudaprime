import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken, payHubErrorStatus } from "../payHubCore.js";
import { updatePersonalMerchantProfile } from "../merchantLedgerCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = (req.body ?? {}) as {
      name?: string;
      shopSymbol?: string;
      shopLocation?: string;
    };
    const merchant = await updatePersonalMerchantProfile(decoded.uid, {
      name: body.name != null ? String(body.name) : undefined,
      shopSymbol: body.shopSymbol != null ? String(body.shopSymbol) : undefined,
      shopLocation: body.shopLocation != null ? String(body.shopLocation) : undefined,
    });
    return res.status(200).json({ ok: true, merchant });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(payHubErrorStatus(msg)).json({ error: msg });
  }
}
