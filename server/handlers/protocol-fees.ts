import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getFeeConfig } from "../protocolCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const config = await getFeeConfig();
    return res.status(200).json({
      ratesBps: config.ratesBps,
      distributionBps: config.distributionBps,
      updatedAt: config.updatedAt ?? null,
      source: config.source,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
