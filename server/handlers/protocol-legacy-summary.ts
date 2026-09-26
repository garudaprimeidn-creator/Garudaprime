import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken, payHubErrorStatus } from "../payHubCore.js";
import { getLegacyPositionSummary } from "../protocolLegacyPayout.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const summary = await getLegacyPositionSummary(decoded.uid);
    return res.status(200).json({ ok: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = payHubErrorStatus(msg);
    return res.status(status).json({ error: msg });
  }
}
