import { buildRuleBasedAiReply, type AiChatMessage } from "../src/lib/ai/aiChatRules.js";
import { buildAiUserSnapshot, type GarudaAiUserContext } from "../src/lib/ai/aiChatContext.js";

export type { AiChatMessage };

export type AiChatContext = GarudaAiUserContext;

export type AiChatResult = {
  reply: string;
  provider: "gemini" | "rules";
};

const GEMINI_MODEL = process.env.AI_GEMINI_MODEL?.trim() || "gemini-2.0-flash";

const geminiApiKey = (): string | null =>
  process.env.GEMINI_API_KEY?.trim()
  || process.env.GOOGLE_GENAI_API_KEY?.trim()
  || null;

const systemPrompt = (ctx: AiChatContext): string => {
  const lang = ctx.lang === "en" ? "English" : "Bahasa Indonesia";
  const snapshot = buildAiUserSnapshot(ctx, ctx.lang ?? "id");

  return [
    "You are Garuda AI, the expert Syariah-compliant financial assistant for Garuda Prime, an Islamic fintech app on Sidra Network.",
    `Always reply in ${lang}. Be warm, precise, and actionable.`,
    "",
    "=== USER SNAPSHOT ===",
    snapshot,
    "",
    "=== APP KNOWLEDGE ===",
    "Garuda Prime features: Wallet (on-chain GAT on Sidra), Pay merchant via QR scan, Send, Swap, Invest (Mudharabah/Musyarakah halal funds, GAT staking), Market checkout, Merchant Center (GP-USR-* merchant IDs, on-chain QR sidra:pay/garuda:pay), Zakat (Community tab, 2.5%), KYC Tier 3, Referral program, Governance DAO, Garuda Chain L2.",
    "Balance terminology: use 'saldo on-chain' / 'on-chain GAT' / 'spendable GAT', Merchant Center 'Saldo Onchain' = on-chain GAT + seller ledger credits.",
    "KYC Tier 3 required for: send, merchant pay, swap, full invest.",
    "Never recommend riba, fixed interest, or non-halal products.",
    "",
    "=== RESPONSE STYLE ===",
    "Use conversation history for follow-ups. Give step-by-step navigation when user asks 'how' (e.g. Dompet → Bayar → Scan QR).",
    "Format with short paragraphs and numbered lists when helpful. 2-5 paragraphs max unless user asks for detail.",
    "If user asks about balance/KYC/status, use the USER SNAPSHOT data above.",
    "If unsure about on-chain state, suggest refreshing Wallet balance or checking transaction history in Tools.",
    "For QR/payment errors, mention: reload merchant QR, verify sidra:pay/garuda:pay format, check KYC & GAT balance.",
  ].join("\n");
};

async function callGemini(
  messages: AiChatMessage[],
  ctx: AiChatContext,
): Promise<string | null> {
  const key = geminiApiKey();
  if (!key) return null;

  const contents = messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(ctx) }] },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.95,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
        ],
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn("[Garuda AI] Gemini error:", res.status, errText.slice(0, 200));
    return null;
  }

  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  return text || null;
}

export async function runAiChat(
  messages: AiChatMessage[],
  ctx: AiChatContext,
): Promise<AiChatResult> {
  const geminiReply = await callGemini(messages.slice(-18), ctx).catch(() => null);
  if (geminiReply) {
    return { reply: geminiReply, provider: "gemini" };
  }

  return {
    reply: buildRuleBasedAiReply(messages, ctx),
    provider: "rules",
  };
}

export { buildRuleBasedAiReply };
