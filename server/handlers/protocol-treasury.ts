import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken } from "../payHubCore.js";
import { getProtocolTreasurySummary } from "../protocolCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    await verifyBearerToken(req.headers.authorization as string | undefined);
    const summary = await getProtocolTreasurySummary();
    return res.status(200).json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg === "Unauthorized" || msg.startsWith("Unauthorized") ? 401 : 500;
    return res.status(status).json({ error: msg });
  }
}
