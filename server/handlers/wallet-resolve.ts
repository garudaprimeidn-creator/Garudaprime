import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import { resolveWalletDisplayNames } from "../walletIdentityCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = (req.body ?? {}) as { addresses?: unknown };
    const raw = Array.isArray(body.addresses) ? body.addresses : [];
    const addresses = raw
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .slice(0, 25);

    const names = await resolveWalletDisplayNames(addresses);
    res.status(200).json({ names });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    const status = message === "Unauthorized" || message.startsWith("Unauthorized") ? 401 : 500;
    res.status(status).json({ error: message });
  }
}
