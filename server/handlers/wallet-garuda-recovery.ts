import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import {
  getGarudaWalletByUid,
  isGarudaNativeWalletEnabled,
  logGarudaSignEvent,
  requestGarudaWalletRecovery,
} from "../garudaWalletCore.js";

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
    const body = (req.body ?? {}) as { note?: string };
    const record = await getGarudaWalletByUid(decoded.uid);
    if (!record) {
      return res.status(404).json({ error: "Garuda wallet not found" });
    }

    await requestGarudaWalletRecovery(decoded.uid, body.note);
    await logGarudaSignEvent({
      uid: decoded.uid,
      walletAddress: record.walletAddress,
      method: "wallet_recovery_request",
      status: "ok",
      meta: { note: body.note?.trim() || null },
    });

    return res.status(200).json({
      ok: true,
      status: "recovering",
      address: record.walletAddress,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("token") || msg.includes("Authorization") ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
}
