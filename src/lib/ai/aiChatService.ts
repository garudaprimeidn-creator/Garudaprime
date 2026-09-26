import { getPayHubAuthToken, isPayHubApiConfigured } from "../payhub/payHubApi";
import { buildRuleBasedAiReply, type AiChatMessage } from "./aiChatRules";
import type { GarudaAiUserContext } from "./aiChatContext";

export type { AiChatMessage };

export type AiChatResponse = {
  reply: string;
  provider: "gemini" | "rules";
};

const API_BASE = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");

export type GarudaAiChatInput = GarudaAiUserContext & {
  messages: AiChatMessage[];
};

/** Send message to Garuda AI, API when configured, local rules offline. */
export async function sendGarudaAiMessage(input: GarudaAiChatInput): Promise<AiChatResponse> {
  const lang = input.lang === "en" ? "en" : "id";
  const ctx: GarudaAiUserContext = {
    lang,
    displayName: input.displayName,
    portfolioUsd: input.portfolioUsd,
    gatBalance: input.gatBalance,
    onChainGat: input.onChainGat,
    walletConnected: input.walletConnected,
    kycVerified: input.kycVerified,
    kycStatus: input.kycStatus,
    referralCode: input.referralCode,
    walletAddress: input.walletAddress,
  };

  if (API_BASE && isPayHubApiConfigured()) {
    try {
      const token = await getPayHubAuthToken();
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: input.messages,
          ...ctx,
        }),
      });

      const data = await res.json().catch(() => ({})) as AiChatResponse & { error?: string };
      if (res.ok && data.reply) {
        return { reply: data.reply, provider: data.provider ?? "rules" };
      }
    } catch {
      /* fall through to local rules */
    }
  }

  return {
    reply: buildRuleBasedAiReply(input.messages, ctx),
    provider: "rules",
  };
}
