import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import {
  freezeGarudaWallet,
  getGarudaWalletByUid,
  isGarudaNativeWalletEnabled,
  logGarudaSignEvent,
} from "../garudaWalletCore.js";
import { consumeGarudaSignSession } from "../garudaWalletSecurity.js";

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
    const body = (req.body ?? {}) as { signToken?: string; reason?: string };
    const record = await getGarudaWalletByUid(decoded.uid);
    if (!record) {
      return res.status(404).json({ error: "Garuda wallet not found" });
    }
    if (record.status === "frozen") {
      return res.status(200).json({ ok: true, status: "frozen", address: record.walletAddress });
    }

    await consumeGarudaSignSession({
      uid: decoded.uid,
      signToken: String(body.signToken ?? ""),
      walletAddress: record.walletAddress,
    });

    await freezeGarudaWallet(decoded.uid, body.reason);
    await logGarudaSignEvent({
      uid: decoded.uid,
      walletAddress: record.walletAddress,
      method: "wallet_freeze",
      status: "ok",
    });

    return res.status(200).json({
      ok: true,
      status: "frozen",
      address: record.walletAddress,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("token") || msg.includes("Authorization")
      ? 401
      : msg.includes("challenge")
        ? 403
        : 400;
    return res.status(status).json({ error: msg });
  }
}
