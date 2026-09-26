import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import { resolvePrimaryWalletForUid } from "../chainBalanceService.js";
import { grantWalletActivationSda } from "../walletActivationCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  if (handleOptions(req.method, res, origin)) return;
  applyCors(res, origin);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = (req.body ?? {}) as { address?: string };
    const fromBody = String(body.address ?? "").trim();
    const wallet = fromBody || (await resolvePrimaryWalletForUid(decoded.uid));

    if (!wallet?.startsWith("0x")) {
      return res.status(400).json({ error: "Wallet address required" });
    }

    const result = await grantWalletActivationSda({
      uid: decoded.uid,
      walletAddress: wallet,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("token") || msg.includes("Authorization") ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
}
