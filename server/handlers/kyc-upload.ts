import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import {
  handleKycUpload,
  kycUploadErrorStatus,
  type KycUploadBody,
} from "../kycUploadCore.js";

export const config = {
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const result = await handleKycUpload(req.headers.authorization, req.body as KycUploadBody);
    res.status(200).json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    res.status(kycUploadErrorStatus(message)).json({ error: message });
  }
}
