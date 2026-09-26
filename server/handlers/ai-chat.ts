import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import { runAiChat, type AiChatMessage, type AiChatContext } from "../aiChatCore.js";
import { getClientIp } from "../clientIp.js";
import { rateLimitOrRespond } from "../httpRateLimit.js";

const pickContext = (body: Record<string, unknown>, displayName?: string): AiChatContext => ({
  lang: body.lang === "en" ? "en" : "id",
  displayName: typeof body.displayName === "string" && body.displayName.trim()
    ? body.displayName.trim()
    : displayName,
  portfolioUsd: typeof body.portfolioUsd === "number" ? body.portfolioUsd : 0,
  gatBalance: typeof body.gatBalance === "number" ? body.gatBalance : undefined,
  onChainGat: typeof body.onChainGat === "number" ? body.onChainGat : undefined,
  walletConnected: typeof body.walletConnected === "boolean" ? body.walletConnected : undefined,
  kycVerified: typeof body.kycVerified === "boolean" ? body.kycVerified : undefined,
  kycStatus: typeof body.kycStatus === "string" ? body.kycStatus : undefined,
  referralCode: typeof body.referralCode === "string" ? body.referralCode : undefined,
  walletAddress: typeof body.walletAddress === "string" ? body.walletAddress : undefined,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    let displayName: string | undefined;
    let rateKey = `ai-chat:ip:${getClientIp(req)}`;
    try {
      const decoded = await verifyBearerToken(req.headers.authorization);
      displayName = decoded.name ?? undefined;
      rateKey = `ai-chat:uid:${decoded.uid}`;
    } catch {
      /* guest chat allowed, rule-based fallback */
    }

    if (rateLimitOrRespond(req, res, rateKey, 30, 60_000)) return;

    const body = (req.body ?? {}) as Record<string, unknown> & { messages?: AiChatMessage[] };

    const messages = Array.isArray(body.messages)
      ? body.messages.filter((m) => m?.role && m?.text?.trim())
      : [];

    if (!messages.length) {
      res.status(400).json({ error: "Missing messages" });
      return;
    }

    const result = await runAiChat(messages, pickContext(body, displayName));

    res.status(200).json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI chat failed";
    res.status(500).json({ error: message });
  }
}
