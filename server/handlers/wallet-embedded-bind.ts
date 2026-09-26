import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import {
  embeddedWalletVendor,
  recordEmbeddedWalletBinding,
  isEmbeddedWalletServerEnabled,
} from "../embeddedWalletCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  if (handleOptions(req.method, res, origin)) return;
  applyCors(res, origin);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!isEmbeddedWalletServerEnabled()) {
      return res.status(503).json({ error: "Embedded wallet not enabled" });
    }
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = (req.body ?? {}) as { address?: string; externalUserId?: string };
    const address = String(body.address ?? "").trim();
    if (!address) return res.status(400).json({ error: "address required" });

    const result = await recordEmbeddedWalletBinding({
      uid: decoded.uid,
      address,
      vendor: embeddedWalletVendor(),
      externalUserId: body.externalUserId,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("token") || msg.includes("Authorization") ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
}
