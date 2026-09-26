import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { fetchGarudaRpcHealth } from "../garudaRpcCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const health = await fetchGarudaRpcHealth();
  res.status(health.ok ? 200 : 503).json({
    ok: health.ok,
    service: health.ok && "fallback" in health && health.fallback
      ? "Sidra RPC (Garuda fallback)"
      : "Garuda Chain RPC",
    chainId: health.ok ? health.chainId : (
      (process.env.VITE_GARUDA_CHAIN_STATUS || "").trim().toLowerCase() === "mainnet"
        ? 8846
        : Number(process.env.VITE_GARUDA_CHAIN_ID) || 8846
    ),
    blockNumber: health.ok ? health.blockNumber : null,
    backend: health.backend,
    fallback: "fallback" in health ? Boolean(health.fallback) : false,
    runtime: "vercel",
  });
}
