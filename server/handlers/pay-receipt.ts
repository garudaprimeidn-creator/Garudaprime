import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { fetchReceiptByCode, payHubErrorStatus, verifyBearerToken } from "../payHubCore.js";
import { canAccessPayReceipt } from "../receiptAccess.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization);
    const code = req.query.code as string;
    if (!code) {
      res.status(400).json({ error: "Missing receipt code" });
      return;
    }

    const receipt = await fetchReceiptByCode(code);
    if (!receipt) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }

    const allowed = await canAccessPayReceipt(decoded.uid, receipt);
    if (!allowed) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.status(200).json({ receipt });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    res.status(payHubErrorStatus(message)).json({ error: message });
  }
}
