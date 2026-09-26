import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import { isGarudaNativeWalletEnabled } from "../garudaWalletCore.js";
import { provisionGarudaWalletAfterKyc } from "../garudaWalletProvision.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  if (handleOptions(req.method, res, origin)) return;
  applyCors(res, origin);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!isGarudaNativeWalletEnabled()) {
      return res.status(503).json({ error: "Garuda native wallet not enabled" });
    }

    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const result = await provisionGarudaWalletAfterKyc(decoded.uid);

    return res.status(200).json({
      ok: true,
      provisioned: result.provisioned,
      address: result.address ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("token") || msg.includes("Authorization")
      ? 401
      : msg.includes("KYC")
        ? 403
        : 400;
    return res.status(status).json({ error: msg });
  }
}
