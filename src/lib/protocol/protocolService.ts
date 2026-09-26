import { getPayHubAuthToken, isPayHubApiConfigured } from "../payhub/payHubApi";

export type ProtocolSettleAction =
  | "market_checkout"
  | "invest_deposit"
  | "invest_redeem"
  | "stake"
  | "unstake"
  | "sda_lock"
  | "sda_unlock"
  | "zakat_pay"
  | "charity_donate";

export type MarketMerchantSplit = {
  merchantId: string;
  grossGat: number;
  orderId?: string;
};

export type ProtocolSettleExtra = {
  amountSda?: number;
  productId?: string;
  fundId?: number;
  merchantSplits?: MarketMerchantSplit[];
  txHash?: string;
  walletAddress?: string;
};

export type ProtocolSettleResult = {
  ok: boolean;
  action: ProtocolSettleAction;
  refId: string;
  grossAmount?: number;
  feeAmount?: number;
  netAmount?: number;
  feeBps?: number;
  stakedSda?: number;
  rewardGat?: number;
  netRewardGat?: number;
};

export async function settleProtocolActionClient(
  action: ProtocolSettleAction,
  grossAmountGat: number,
  refId: string,
  extra?: ProtocolSettleExtra,
): Promise<ProtocolSettleResult | null> {
  if (!isPayHubApiConfigured()) return null;

  const idToken = await getPayHubAuthToken();
  if (!idToken) throw new Error("Login required for protocol settlement");

  const base = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");
  const res = await fetch(`${base}/protocol/settle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ action, grossAmountGat, refId, ...extra }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Protocol settle failed (${res.status})`);
  }
  return data as ProtocolSettleResult;
}

export function isProtocolApiConfigured(): boolean {
  return isPayHubApiConfigured();
}
