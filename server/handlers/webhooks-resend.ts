import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifySvixWebhook } from "../svixVerify.js";

/**
 * Resend delivery webhooks (email.sent, email.delivered, email.bounced, …).
 * Configure in Resend Dashboard → Webhooks.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  if (handleOptions(req.method, res, origin)) return;
  applyCors(res, origin);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return res.status(503).json({ error: "Webhook secret not configured" });
  }

  const rawBody = typeof req.body === "string"
    ? req.body
    : JSON.stringify(req.body ?? {});

  const signature = req.headers["svix-signature"] as string | undefined;
  const svixId = req.headers["svix-id"] as string | undefined;
  const svixTimestamp = req.headers["svix-timestamp"] as string | undefined;

  if (!signature || !svixId || !svixTimestamp) {
    return res.status(401).json({ error: "Missing webhook signature" });
  }

  if (!verifySvixWebhook(secret, rawBody, {
    id: svixId,
    timestamp: svixTimestamp,
    signature,
  })) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  const body = typeof req.body === "object" && req.body !== null
    ? req.body
    : JSON.parse(rawBody) as Record<string, unknown>;
  const bodyData = body.data as Record<string, unknown> | undefined;
  const eventType = String(body.type ?? body.event ?? "unknown");
  const emailId = bodyData?.email_id ?? bodyData?.id ?? null;
  const to = bodyData?.to ?? bodyData?.email ?? null;

  if (process.env.NODE_ENV !== "production" || eventType.includes("bounced") || eventType.includes("failed")) {
    console.info("[Resend Webhook]", eventType, { emailId, to });
  }

  return res.status(200).json({ ok: true, received: eventType });
}
