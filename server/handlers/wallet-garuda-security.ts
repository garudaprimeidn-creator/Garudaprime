import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import { getGarudaWalletSecuritySummary, isGarudaNativeWalletEnabled } from "../garudaWalletCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  if (handleOptions(req.method, res, origin)) return;
  applyCors(res, origin);

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!isGarudaNativeWalletEnabled()) {
      return res.status(200).json({ enabled: false, hasWallet: false });
    }

    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const summary = await getGarudaWalletSecuritySummary(decoded.uid);
    return res.status(200).json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = /unauthorized|authorization|token/i.test(msg) ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
}
