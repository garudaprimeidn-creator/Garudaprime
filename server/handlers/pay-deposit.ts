import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken } from "../payHubCore.js";
import {
  depositPayHubGat,
  payLedgerErrorStatus,
} from "../payLedgerCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = (req.body ?? {}) as { txHash?: string; walletAddress?: string };
    const txHash = String(body.txHash ?? "").trim();
    const walletAddress = String(body.walletAddress ?? "").trim();

    const result = await depositPayHubGat(decoded.uid, walletAddress, txHash);
    return res.status(200).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(payLedgerErrorStatus(msg)).json({ error: msg });
  }
}
