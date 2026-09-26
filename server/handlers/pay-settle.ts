import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import {
  friendlyPayHubError,
  payHubErrorStatus,
  settlePayHub,
  verifyBearerToken,
  type SettleBody,
} from "../payHubCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization);
    const result = await settlePayHub(req.body as SettleBody, decoded.uid);
    res.status(200).json(result);
  } catch (e) {
    const message = friendlyPayHubError(e);
    res.status(payHubErrorStatus(message)).json({ error: message });
  }
}
