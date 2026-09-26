import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "node:crypto";
import { applyCors, handleOptions } from "../vercelCors.js";

/** KYCPort webhook, verify HMAC signature, idempotent handler. @see kycport.com/docs */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const secret = process.env.KYCPORT_WEBHOOK_SECRET?.trim();
  if (!secret) {
    res.status(503).json({ error: "Webhook secret not configured" });
    return;
  }

  const rawBody = typeof req.body === "string"
    ? req.body
    : JSON.stringify(req.body ?? {});

  const signature = String(
    req.headers["x-kycport-signature"]
    ?? req.headers["x-webhook-signature"]
    ?? "",
  ).trim();

  if (!signature) {
    res.status(401).json({ error: "Missing webhook signature" });
    return;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.replace(/^sha256=/i, "");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }
  } catch {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  // Idempotent ack, downstream sync can be wired to Firestore when event schema is registered.
  res.status(200).json({ ok: true, received: true });
}
