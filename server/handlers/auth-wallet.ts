import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import {
  verifyWalletAuthPayload,
  walletAuthErrorStatus,
  type WalletAuthBody,
} from "../walletAuthCore.js";
import { rateLimitByIp } from "../httpRateLimit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  if (handleOptions(req.method, res, origin)) return;
  applyCors(res, origin);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    if (rateLimitByIp(req, res, "wallet-auth", 20, 60_000)) return;

    const customToken = await verifyWalletAuthPayload(req.body as WalletAuthBody);
    res.status(200).json({ customToken });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    res.status(walletAuthErrorStatus(message)).json({ error: message });
  }
}
