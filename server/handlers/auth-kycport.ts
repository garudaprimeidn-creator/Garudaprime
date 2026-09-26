import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import {
  verifyKycPortAuthPayload,
  kycPortAuthErrorStatus,
  type KycPortAuthBody,
} from "../kycportAuthCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const result = await verifyKycPortAuthPayload(req.body as KycPortAuthBody);
    res.status(200).json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    res.status(kycPortAuthErrorStatus(message)).json({ error: message });
  }
}
