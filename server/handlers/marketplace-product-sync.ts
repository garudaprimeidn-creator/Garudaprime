import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import {
  marketplaceSyncErrorStatus,
  syncMarketplaceProductAdmin,
  type MarketplaceProductPayload,
} from "../marketplaceProductCore.js";

export const config = {
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const result = await syncMarketplaceProductAdmin(
      req.headers.authorization,
      req.body as MarketplaceProductPayload,
    );
    res.status(200).json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    res.status(marketplaceSyncErrorStatus(message)).json({ error: message });
  }
}
