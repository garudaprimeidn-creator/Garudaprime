import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import {
  GARUDA_NATIVE_PROVIDER,
  getGarudaWalletByUid,
  isGarudaNativeWalletEnabled,
} from "../garudaWalletCore.js";
import { provisionGarudaWalletAfterKyc } from "../garudaWalletProvision.js";
import { consumeWalletCreateOtpSession, isWalletCreateOtpRequired } from "../walletCreateOtpCore.js";

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

    let otpVerified = false;
    if (isWalletCreateOtpRequired()) {
      const body = (req.body ?? {}) as { otpSession?: string };
      otpVerified = await consumeWalletCreateOtpSession(decoded.uid, String(body.otpSession ?? ""));
      if (!otpVerified) {
        return res.status(403).json({ error: "Verifikasi OTP dompet diperlukan" });
      }
    }

    const provisioned = await provisionGarudaWalletAfterKyc(decoded.uid, {
      skipKycCheck: otpVerified,
    });
    if (!provisioned.provisioned) {
      return res.status(503).json({ error: "Garuda native wallet not available" });
    }

    const record = await getGarudaWalletByUid(decoded.uid);
    if (!record) {
      return res.status(500).json({ error: "Garuda wallet provisioning incomplete" });
    }

    return res.status(200).json({
      ok: true,
      address: record.walletAddress,
      publicKey: record.publicKey,
      provider: GARUDA_NATIVE_PROVIDER,
      network: record.network,
      chainId: record.chainId,
      status: record.status,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("token") || msg.includes("Authorization")
      ? 401
      : msg.includes("KYC")
        ? 403
        : 400;
    return res.status(status).json({ error: msg });
  }
}
