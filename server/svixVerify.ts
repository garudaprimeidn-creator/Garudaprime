import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_SEC = 5 * 60;

function decodeSvixSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  const encoded = trimmed.startsWith("whsec_") ? trimmed.slice("whsec_".length) : trimmed;
  return Buffer.from(encoded, "base64");
}

/**
 * Verify Resend/Svix webhook signatures.
 * @see https://docs.svix.com/receiving/verifying-payloads/how
 */
export function verifySvixWebhook(
  secret: string,
  rawBody: string,
  headers: {
    id?: string;
    timestamp?: string;
    signature?: string;
  },
): boolean {
  const id = headers.id?.trim();
  const timestamp = headers.timestamp?.trim();
  const signatureHeader = headers.signature?.trim();
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > MAX_SKEW_SEC) return false;

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const key = decodeSvixSecret(secret);
  const expected = createHmac("sha256", key).update(signedContent).digest("base64");

  for (const part of signatureHeader.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* try next signature */
    }
  }
  return false;
}
