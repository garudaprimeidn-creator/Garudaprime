export type CommunityFundStats = {
  balanceGat: number;
  totalReceived: number;
  totalDisbursed: number;
};

export type CommunityDisbursement = {
  id: string;
  fund: "zakat" | "charity";
  amountGat: number;
  recipientName: string;
  recipientAddress: string | null;
  note: string | null;
  txHash: string | null;
  createdAt?: unknown;
};

export type CommunityFundsPublicSummary = {
  zakat: CommunityFundStats;
  charity: CommunityFundStats;
  recentDisbursements: CommunityDisbursement[];
  recentContributions: { id: string; fund: "zakat" | "charity"; netAmount: number; createdAt?: unknown }[];
};

function apiBase(): string {
  const env = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (env) return env.replace(/\/$/, "");
  return "";
}

export function isCommunityFundsApiConfigured(): boolean {
  return Boolean(apiBase() || import.meta.env.DEV);
}

export async function fetchCommunityFundsSummary(): Promise<CommunityFundsPublicSummary | null> {
  const base = apiBase();
  const url = base ? `${base}/protocol/community-funds` : "/api/protocol/community-funds";
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as CommunityFundsPublicSummary;
  } catch {
    return null;
  }
}
