import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import { transferPayHubGat, payTransferErrorStatus } from "../payTransferCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = (req.body ?? {}) as { recipientAddress?: string; amount?: number | string };
    const recipientAddress = String(body.recipientAddress ?? "").trim();
    const amount = typeof body.amount === "string" ? parseFloat(body.amount) : Number(body.amount);

    const result = await transferPayHubGat(decoded.uid, recipientAddress, amount);
    res.status(200).json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    res.status(payTransferErrorStatus(message)).json({ error: message });
  }
}
