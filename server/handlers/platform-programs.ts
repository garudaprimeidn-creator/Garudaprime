import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPlatformProgramsBundle } from "../platformProgramsCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store, max-age=0");
  const bundle = await getPlatformProgramsBundle();
  return res.status(200).json(bundle);
}
