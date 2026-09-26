import { getPayHubAuthToken, isPayHubApiConfigured } from "../payhub/payHubApi";

export type ValidatorRewardEvent = {
  id: string;
  uid: string;
  applicationId: string;
  type: "join" | "monthly";
  rewardGat: number;
  periodKey?: string | null;
  createdAt: string | null;
};

export type ValidatorStats = {
  programEnabled: boolean;
  joinRewardGat: number;
  monthlyRewardGat: number;
  minStakeSda: number;
  application: {
    id: string;
    status: string;
    walletAddress: string;
    email: string;
    orgName: string | null;
    stakeSda: string | null;
    stakeAmount?: number;
    appliedAt: string | null;
    approvedAt: string | null;
  } | null;
  canApply?: boolean;
  totalEarnedGat: number;
  joinRewardPaid: boolean;
  lastMonthlyPeriod: string | null;
  history: ValidatorRewardEvent[];
};

function apiBase(): string | null {
  return import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "") || null;
}

export async function fetchValidatorStats(): Promise<ValidatorStats | null> {
  const base = apiBase();
  if (!base || !isPayHubApiConfigured()) return null;

  const token = await getPayHubAuthToken();
  if (!token) return null;

  try {
    const res = await fetch(`${base}/validators/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as ValidatorStats;
  } catch {
    return null;
  }
}
