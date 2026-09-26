import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken, payHubErrorStatus } from "../payHubCore.js";
import { proxyGarudaRpc } from "../garudaRpcCore.js";
import { assertAllowedRpcMethod } from "../garudaRpcAllowlist.js";
import { checkRateLimit } from "../rateLimit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  if (handleOptions(req.method, res, origin)) return;
  applyCors(res, origin);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const rate = checkRateLimit(`garuda-rpc:${decoded.uid}`, 60, 60_000);
    if (rate.ok === false) {
      res.status(429).json({ error: "Too many requests", retryAfterSec: rate.retryAfterSec });
      return;
    }

    const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    assertAllowedRpcMethod(body);
    const { status, text } = await proxyGarudaRpc(body);
    res.status(status).setHeader("Content-Type", "application/json").send(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : "RPC proxy error";
    const status =
      message === "Unauthorized"
      || message.includes("token")
      || message.includes("Authorization")
        ? 401
        : message.includes("not allowed") || message.includes("Invalid JSON")
          ? 400
          : 502;
    res.status(status).json({ error: message });
  }
}
