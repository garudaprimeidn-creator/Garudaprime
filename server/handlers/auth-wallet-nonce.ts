import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { issueWalletAuthNonce } from "../walletAuthNonce.js";
import { rateLimitByIp, rateLimitOrRespond } from "../httpRateLimit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    if (rateLimitByIp(req, res, "wallet-nonce", 40, 60_000)) return;

    const address = String(req.query.address ?? "").trim();
    if (address && rateLimitOrRespond(req, res, `wallet-nonce:addr:${address.toLowerCase()}`, 12, 60_000)) {
      return;
    }

    const result = await issueWalletAuthNonce(address);
    res.status(200).json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Nonce error";
    const status = message === "Invalid address" ? 400 : 500;
    res.status(status).json({ error: message });
  }
}
