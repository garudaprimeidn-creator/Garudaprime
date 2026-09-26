import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import {
  assertGarudaWalletOwner,
  ensureGarudaWalletForUser,
  isGarudaNativeWalletEnabled,
  derivedGarudaWalletAddress,
} from "../garudaWalletCore.js";
import { issueGarudaSignSession } from "../garudaWalletSecurity.js";

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
    await ensureGarudaWalletForUser(decoded.uid, { skipKycCheck: true }).catch(() => undefined);

    const body = (req.body ?? {}) as { address?: string };
    const address = String(body.address ?? "").trim();
    const canonical = derivedGarudaWalletAddress(decoded.uid);

    if (address.startsWith("0x")) {
      await assertGarudaWalletOwner(decoded.uid, address).catch(() => undefined);
    }

    const deviceId = String(req.headers["x-garuda-device-id"] ?? "").trim() || undefined;
    const session = await issueGarudaSignSession({
      uid: decoded.uid,
      deviceId,
      walletAddress: canonical,
    });

    return res.status(200).json({ ok: true, address: canonical, ...session });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("token") || msg.includes("Authorization") ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
}
