import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken, payHubErrorStatus } from "../payHubCore.js";
import { settleProtocolAction, type ProtocolSettleAction } from "../protocolCore.js";

const ACTIONS = new Set<ProtocolSettleAction>([
  "market_checkout",
  "sda_lock",
  "sda_unlock",
  "zakat_pay",
  "charity_donate",
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = req.body ?? {};
    const action = body.action as ProtocolSettleAction;
    const grossAmountGat = parseFloat(String(body.grossAmountGat ?? "0"));
    const refId = String(body.refId ?? "").trim();
    const amountSda = body.amountSda != null ? parseFloat(String(body.amountSda)) : undefined;
    const productId = body.productId != null ? String(body.productId).trim() : undefined;
    const fundId = body.fundId != null ? parseInt(String(body.fundId), 10) : undefined;
    const txHash = body.txHash != null ? String(body.txHash).trim() : undefined;
    const walletAddress = body.walletAddress != null ? String(body.walletAddress).trim() : undefined;
    const merchantSplits = Array.isArray(body.merchantSplits)
      ? body.merchantSplits
          .map((row: { merchantId?: string; grossGat?: number; orderId?: string }) => ({
            merchantId: String(row.merchantId ?? "").trim(),
            grossGat: parseFloat(String(row.grossGat ?? "0")),
            orderId: row.orderId ? String(row.orderId) : undefined,
          }))
          .filter((row: { merchantId: string; grossGat: number }) => row.merchantId && row.grossGat > 0)
      : undefined;

    if (!ACTIONS.has(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }
    if (!refId) {
      return res.status(400).json({ error: "Missing refId" });
    }

    const result = await settleProtocolAction(decoded.uid, action, grossAmountGat, refId, {
      amountSda,
      productId,
      fundId: Number.isFinite(fundId) ? fundId : undefined,
      merchantSplits,
      txHash,
      walletAddress,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = payHubErrorStatus(msg);
    return res.status(status).json({ error: msg });
  }
}
