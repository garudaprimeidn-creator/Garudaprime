import type { VercelRequest, VercelResponse } from "@vercel/node";
import { listFailedRelayerJobs } from "../payRelayerCore.js";

/** Admin/cron: daftar job relayer gagal (retry manual via admin withdraw). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const secret = process.env.ADMIN_PAY_OPS_SECRET?.trim();
  const header = req.headers["x-admin-pay-ops-secret"];
  const provided = typeof header === "string" ? header : Array.isArray(header) ? header[0] : "";
  if (!secret || provided !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const jobs = await listFailedRelayerJobs(30);
    res.status(200).json({ ok: true, jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
}
