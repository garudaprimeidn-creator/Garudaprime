import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken } from "../payHubCore.js";
import {
  getPayLedger,
  payLedgerErrorStatus,
  withdrawPayHubGat,
} from "../payLedgerCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);

    if (req.method === "GET") {
      return res.status(200).json(await getPayLedger(decoded.uid));
    }

    if (req.method === "POST") {
      const body = (req.body ?? {}) as {
        amount?: number | string;
        walletAddress?: string;
        asset?: string;
      };
      const amount = typeof body.amount === "string" ? Number(body.amount) : Number(body.amount);
      const walletAddress = String(body.walletAddress ?? "").trim();
      const asset = String(body.asset ?? "GAT").toUpperCase();
      if (asset === "SDA") {
        return res.status(400).json({ error: "Pay Hub SDA balance is disabled" });
      }
      const result = await withdrawPayHubGat(decoded.uid, walletAddress, amount);
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(payLedgerErrorStatus(msg)).json({ error: msg });
  }
}
