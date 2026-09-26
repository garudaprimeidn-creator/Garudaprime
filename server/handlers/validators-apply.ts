import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import {
  applyValidator,
  validatorErrorStatus,
  verifyAuth,
  type ValidatorApplyBody,
} from "../validatorCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const decoded = await verifyAuth(req.headers.authorization);
    const result = await applyValidator(req.body as ValidatorApplyBody, decoded.uid);
    res.status(200).json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    res.status(validatorErrorStatus(message)).json({ error: message });
  }
}
