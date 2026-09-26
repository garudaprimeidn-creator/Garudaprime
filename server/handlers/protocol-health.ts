import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getProtocolHealthReport } from "../protocolHealthCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const report = await getProtocolHealthReport();
    return res.status(200).json(report);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: msg });
  }
}
