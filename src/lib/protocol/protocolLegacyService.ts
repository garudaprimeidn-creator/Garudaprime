import { getPayHubAuthToken, isPayHubApiConfigured } from "../payhub/payHubApi";

export type LegacyReleaseResult = {
  ok: boolean;
  action: "invest_redeem" | "unstake";
  refId: string;
  grossAmount?: number;
  feeAmount?: number;
  netAmount?: number;
  payoutTxHash?: string;
  payoutWallet?: string;
  channel?: "ledger" | "onchain";
};

function apiBase(): string | null {
  const base = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");
  return base || null;
}

async function postLegacy(
  path: string,
  body: { refId: string; grossAmountGat: number; walletAddress: string },
): Promise<LegacyReleaseResult> {
  if (!isPayHubApiConfigured()) {
    throw new Error("API not configured");
  }

  const idToken = await getPayHubAuthToken();
  if (!idToken) throw new Error("Login required");

  const base = apiBase();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Legacy release failed (${res.status})`);
  }
  return data as LegacyReleaseResult;
}

export async function releaseLegacyInvest(
  refId: string,
  grossAmountGat: number,
  walletAddress: string,
): Promise<LegacyReleaseResult> {
  return postLegacy("/protocol/legacy-redeem-invest", { refId, grossAmountGat, walletAddress });
}

export async function releaseLegacyStake(
  refId: string,
  grossAmountGat: number,
  walletAddress: string,
): Promise<LegacyReleaseResult> {
  return postLegacy("/protocol/legacy-unstake-gat", { refId, grossAmountGat, walletAddress });
}
