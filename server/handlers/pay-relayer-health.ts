import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRelayerHealth } from "../payRelayerCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const health = await getRelayerHealth();
    res.status(200).json({ ok: true, health });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
}
