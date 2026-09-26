import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import {
  marketplaceImageErrorStatus,
  streamMarketplaceProductMedia,
} from "../marketplaceImageCore.js";

export const config = {
  maxDuration: 30,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const query = req.query as Record<string, string | string[] | undefined>;
    const pick = (key: string) => {
      const value = query[key];
      return Array.isArray(value) ? value[0] : value;
    };

    const payload = await streamMarketplaceProductMedia({
      merchantId: pick("merchantId"),
      productId: pick("productId"),
      index: pick("index"),
    });

    if (!payload) {
      res.status(404).json({ error: "Foto produk tidak ditemukan" });
      return;
    }

    res.setHeader("Content-Type", payload.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.status(200).send(payload.buffer);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    res.status(marketplaceImageErrorStatus(message)).json({ error: message });
  }
}
