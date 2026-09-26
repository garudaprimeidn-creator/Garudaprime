import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import {
  getGarudaWalletByUid,
  isGarudaNativeWalletEnabled,
  logGarudaSignEvent,
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
    const body = (req.body ?? {}) as { address?: string };
    const address = String(body.address ?? "").trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const record = await getGarudaWalletByUid(decoded.uid);
    if (!record) {
      return res.status(404).json({ error: "Garuda wallet not found" });
    }
    if (record.status === "frozen") {
      return res.status(403).json({ error: "Garuda wallet is frozen" });
    }
    if (record.walletAddress !== address) {
      return res.status(403).json({ error: "Recovery phrase does not match this account wallet" });
    }

    await logGarudaSignEvent({
      uid: decoded.uid,
      walletAddress: record.walletAddress,
      method: "wallet_recovery_unlock",
      status: "ok",
    });

    return res.status(200).json({
      ok: true,
      address: record.walletAddress,
      unlockedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("token") || msg.includes("Authorization") ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
}
