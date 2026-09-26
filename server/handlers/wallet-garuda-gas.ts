import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import { resolveCanonicalGarudaWalletAddress } from "../garudaWalletCore.js";
import { ensureGarudaWalletGas, estimateGarudaTxGasSda } from "../garudaWalletGasSponsor.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  if (handleOptions(req.method, res, origin)) return;
  applyCors(res, origin);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = (req.body ?? {}) as {
      address?: string;
      to?: string;
      data?: string;
      value?: string;
      txCount?: number;
    };
    const address = String(body.address ?? "").trim();
    if (!address.startsWith("0x")) {
      return res.status(400).json({ error: "Wallet address required" });
    }

    const wallet = await resolveCanonicalGarudaWalletAddress(decoded.uid, address) ?? address;
    const estimated = body.to
      ? await estimateGarudaTxGasSda(wallet, body).catch(() => 0.08)
      : 0.08;

    const result = await ensureGarudaWalletGas({
      uid: decoded.uid,
      walletAddress: wallet,
      estimatedGasSda: estimated,
      txCount: Math.max(1, Math.min(Number(body.txCount) || 1, 3)),
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("token") || msg.includes("Authorization") ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
}
