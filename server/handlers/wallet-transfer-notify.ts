import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import { notifyWalletTransferRecipient } from "../walletTransferNotifyCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = (req.body ?? {}) as {
      recipientAddress?: string;
      senderAddress?: string;
      amount?: number | string;
      symbol?: string;
      txHash?: string;
    };

    const recipientAddress = String(body.recipientAddress ?? "").trim();
    const senderAddress = String(body.senderAddress ?? "").trim() || undefined;
    const txHash = String(body.txHash ?? "").trim();
    const amount = typeof body.amount === "string" ? parseFloat(body.amount) : Number(body.amount);
    const rawSymbol = String(body.symbol ?? "GAT").trim().toUpperCase();
    const symbol = rawSymbol === "SDA" ? "SDA" : "GAT";

    if (!recipientAddress) {
      res.status(400).json({ error: "recipientAddress required" });
      return;
    }
    if (!txHash) {
      res.status(400).json({ error: "txHash required" });
      return;
    }

    const result = await notifyWalletTransferRecipient({
      senderUid: decoded.uid,
      senderAddress,
      recipientAddress,
      amount,
      symbol,
      txHash,
    });

    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    const status = message === "Unauthorized" || message.startsWith("Unauthorized")
      ? 401
      : message.includes("Invalid") || message.includes("required")
        ? 400
        : 500;
    res.status(status).json({ error: message });
  }
}
