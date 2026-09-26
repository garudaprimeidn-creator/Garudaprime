import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken } from "../payHubCore.js";
import {
  confirmOnChainSwap,
  paySwapErrorStatus,
  swapPayHubLedger,
  type SwapSymbol,
} from "../paySwapCore.js";

const isSymbol = (v: unknown): v is SwapSymbol => v === "GAT" || v === "SDA";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = req.body ?? {};
    const mode = String(body.mode ?? "pay_hub");
    const from = body.from as SwapSymbol;
    const to = body.to as SwapSymbol;

    if (!isSymbol(from) || !isSymbol(to)) {
      return res.status(400).json({ error: "Invalid swap pair" });
    }

    if (mode === "onchain") {
      const txHash = String(body.txHash ?? "").trim();
      const walletAddress = String(body.walletAddress ?? "").trim();
      if (!txHash || !walletAddress) {
        return res.status(400).json({ error: "Missing txHash or walletAddress" });
      }
      const result = await confirmOnChainSwap(decoded.uid, walletAddress, txHash, from, to);
      return res.status(200).json(result);
    }

    const fromAmount = typeof body.amount === "string" ? Number(body.amount) : Number(body.amount);
    const walletAddress = String(body.walletAddress ?? "").trim() || undefined;
    const result = await swapPayHubLedger(decoded.uid, from, to, fromAmount, walletAddress);
    return res.status(200).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(paySwapErrorStatus(msg)).json({ error: msg });
  }
}
