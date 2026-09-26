import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import {
  getGarudaWalletByUid,
  isGarudaNativeWalletEnabled,
  logGarudaSignEvent,
} from "../garudaWalletCore.js";
import { consumeGarudaSignSession } from "../garudaWalletSecurity.js";
import { buildGarudaWalletExport } from "../garudaWalletExport.js";

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
    const record = await getGarudaWalletByUid(decoded.uid);
    if (!record) {
      return res.status(404).json({ error: "Garuda wallet not found" });
    }
    if (record.status === "frozen") {
      return res.status(403).json({ error: "Garuda wallet is frozen" });
    }

    const body = (req.body ?? {}) as { signToken?: string };
    await consumeGarudaSignSession({
      uid: decoded.uid,
      signToken: String(body.signToken ?? ""),
      walletAddress: record.walletAddress,
    });

    const exported = buildGarudaWalletExport(decoded.uid);
    if (exported.address !== record.walletAddress.toLowerCase()) {
      return res.status(500).json({ error: "Wallet address mismatch" });
    }

    await logGarudaSignEvent({
      uid: decoded.uid,
      walletAddress: record.walletAddress,
      method: "wallet_export",
      status: "ok",
    });

    return res.status(200).json({
      ok: true,
      address: exported.address,
      privateKey: exported.privateKey,
      recoveryPhrase: exported.recoveryPhrase,
      network: exported.network,
      chainId: exported.chainId,
      exportedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("token") || msg.includes("Authorization")
      ? 401
      : msg.includes("challenge") || msg.includes("Sign session")
        ? 403
        : 400;
    return res.status(status).json({ error: msg });
  }
}
