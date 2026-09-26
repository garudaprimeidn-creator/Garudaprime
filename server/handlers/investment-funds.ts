import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getInvestmentFundsConfig } from "../investmentFundsCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const config = await getInvestmentFundsConfig();
    return res.status(200).json({
      funds: config.funds,
      round: config.round ?? null,
      source: config.source,
      updatedAt: config.updatedAt ?? null,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
