import { getPayHubAuthToken, isPayHubApiConfigured } from "../payhub/payHubApi";
import { normalizeReferralCode } from "./referralRef";

export type ReferralStats = {
  referralCode: string;
  canBindReferral: boolean;
  singleSponsor: boolean;
  referredByCode: string | null;
  totalReferred: number;
  completed: number;
  pending: number;
  totalEarnedGat: number;
  pendingRewardGat: number;
  tierBonusesTotal: number;
  conversionPct: number;
  autoReward: boolean;
  rewardPolicy: {
    baseRewardGat: number;
    requireKycTier: number;
    distributionMode: "locked" | "pay_hub" | "sidra_treasury";
    payoutReady: boolean;
    lockedUntilTokenLaunch: boolean;
    usageEnabled: boolean;
  };
  nextTier: {
    minReferrals: number;
    bonusGat: number;
    label: string;
    remaining: number;
  } | null;
  history: {
    referredUid: string;
    name: string;
    status: string;
    date: string | null;
    rewardGat: number;
  }[];
};

export type ReferralKycProcessResult = {
  processed?: boolean;
  baseProcessed?: boolean;
  pendingSynced?: number;
  tierBonus?: number;
};

function apiBase(): string | null {
  return import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "") || null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const base = apiBase();
  if (!base || !isPayHubApiConfigured()) return null;

  const token = await getPayHubAuthToken();
  if (!token) return null;

  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

export async function bindReferralCodeClient(code: string): Promise<{ ok: boolean; error?: string }> {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return { ok: false, error: "Invalid referral code" };

  try {
    const res = await authFetch("/referral/bind", {
      method: "POST",
      body: JSON.stringify({ code: normalized }),
    });
    if (!res) return { ok: false, error: "API not configured" };
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Bind failed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function fetchReferralStats(): Promise<ReferralStats | null> {
  try {
    const res = await authFetch("/referral/stats");
    if (!res?.ok) return null;
    return (await res.json()) as ReferralStats;
  } catch {
    return null;
  }
}

export async function processReferralKycClient(_kycTier?: number): Promise<ReferralKycProcessResult | null> {
  try {
    const res = await authFetch("/referral/process-kyc", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!res?.ok) return null;
    return (await res.json()) as ReferralKycProcessResult;
  } catch {
    return null;
  }
}

export async function syncReferralRewardsClient(): Promise<ReferralKycProcessResult | null> {
  try {
    const res = await authFetch("/referral/sync", { method: "POST", body: JSON.stringify({}) });
    if (!res?.ok) return null;
    return (await res.json()) as ReferralKycProcessResult;
  } catch {
    return null;
  }
}

export async function applyPendingReferralCode(): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const { isReferralProgramAvailable } = await import("./referralProgramGate");
  if (!isReferralProgramAvailable()) return { ok: true, skipped: true };
  const { getPendingReferralCode, clearPendingReferralCode } = await import("./referralRef");
  const pending = getPendingReferralCode();
  if (!pending) return { ok: true, skipped: true };
  const result = await bindReferralCodeClient(pending);
  if (result.ok) clearPendingReferralCode();
  else if (result.error?.includes("registration") || result.error?.includes("Sponsor")) {
    clearPendingReferralCode();
  }
  return result;
}
