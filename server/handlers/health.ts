import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);
  res.status(200).json({ ok: true, service: "Garuda Pay Hub", phase: 1, runtime: "vercel" });
}
