import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import { isGarudaNativeWalletEnabled } from "../garudaWalletCore.js";
import { verifyWalletCreateOtp } from "../walletCreateOtpCore.js";
import { rateLimitOrRespond } from "../httpRateLimit.js";

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
    if (rateLimitOrRespond(req, res, `wallet-otp-verify:${decoded.uid}`, 10, 60_000)) {
      return;
    }

    const body = (req.body ?? {}) as { code?: string };
    const code = String(body.code ?? "").trim();
    if (!code) {
      return res.status(400).json({ error: "Missing OTP code" });
    }

    const result = await verifyWalletCreateOtp(decoded.uid, code);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = /unauthorized|authorization|token/i.test(msg) ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
}
