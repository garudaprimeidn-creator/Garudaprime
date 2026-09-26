import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCommunityFundsPublicSummary } from "../communityFundsCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const summary = await getCommunityFundsPublicSummary();
    return res.status(200).json(summary);
  } catch (err) {
    return res.status(503).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
