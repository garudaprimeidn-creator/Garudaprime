import { getPayHubAuthToken, isPayHubApiConfigured } from "../payhub/payHubApi";

export type VerifyInvestInput = {
  refId: string;
  txHash: string;
  walletAddress: string;
  fundId: number;
  positionId?: number;
};

export type VerifyStakeInput = {
  refId: string;
  txHash: string;
  walletAddress: string;
  stakeId?: number;
};

export type VerifyInvestResult = {
  ok: boolean;
  action: "invest_deposit";
  refId: string;
  fundId: number;
  positionId: number;
  amountGat: number;
  feeGat: number;
  txHash: string;
  source: "onchain";
};

export type VerifyStakeResult = {
  ok: boolean;
  action: "stake";
  refId: string;
  stakeId: number;
  amountGat: number;
  feeGat: number;
  lockUntil: number;
  txHash: string;
  source: "onchain";
};

function apiBase(): string | null {
  const base = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");
  return base || null;
}

export async function verifyOnChainInvest(
  input: VerifyInvestInput,
): Promise<VerifyInvestResult | null> {
  if (!isPayHubApiConfigured()) return null;

  const idToken = await getPayHubAuthToken();
  if (!idToken) throw new Error("Login required for on-chain verification");

  const base = apiBase();
  const res = await fetch(`${base}/protocol/verify-invest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(input),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Verify invest failed (${res.status})`);
  }
  return data as VerifyInvestResult;
}

export async function verifyOnChainStake(
  input: VerifyStakeInput,
): Promise<VerifyStakeResult | null> {
  if (!isPayHubApiConfigured()) return null;

  const idToken = await getPayHubAuthToken();
  if (!idToken) throw new Error("Login required for on-chain verification");

  const base = apiBase();
  const res = await fetch(`${base}/protocol/verify-stake`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(input),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Verify stake failed (${res.status})`);
  }
  return data as VerifyStakeResult;
}
