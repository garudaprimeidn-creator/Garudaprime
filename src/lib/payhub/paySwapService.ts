import { getPayHubAuthToken, isPayHubApiConfigured } from "./payHubApi";
import type { PayLedgerSnapshot } from "./payLedgerService";

export type SwapSymbol = "GAT" | "SDA";
export type SwapSource = "pay_hub" | "wallet";

export type SwapResult = {
  from: SwapSymbol;
  to: SwapSymbol;
  fromAmount: number;
  netToAmount: number;
  feeAmount: number;
  source: SwapSource;
  delivery?: "pay_hub" | "wallet";
  txHash?: string;
  gatBalance?: number;
  sdaBalance?: number;
};

function apiBase(): string | null {
  const base = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");
  return base || null;
}

export async function swapPayHubTokens(
  from: SwapSymbol,
  to: SwapSymbol,
  amount: number,
  walletAddress?: string,
): Promise<SwapResult> {
  const base = apiBase();
  if (!base || !isPayHubApiConfigured()) {
    throw new Error("Pay Hub API not configured");
  }

  const token = await getPayHubAuthToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${base}/pay/swap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mode: "pay_hub",
      from,
      to,
      amount,
      ...(walletAddress ? { walletAddress } : {}),
    }),
  });

  const data = await res.json().catch(() => ({})) as SwapResult & {
    error?: string;
    netToAmount?: number;
    delivery?: "pay_hub" | "wallet";
    outboundTxHash?: string;
  };
  if (!res.ok) throw new Error(data.error || "Swap failed");

  return {
    from,
    to,
    fromAmount: amount,
    netToAmount: data.netToAmount ?? 0,
    feeAmount: data.feeAmount ?? 0,
    source: "pay_hub",
    delivery: data.delivery,
    gatBalance: data.gatBalance,
    sdaBalance: data.sdaBalance,
    txHash: data.outboundTxHash ?? data.txHash,
  };
}

export async function confirmOnChainSwap(
  from: SwapSymbol,
  to: SwapSymbol,
  txHash: string,
  walletAddress: string,
): Promise<SwapResult> {
  const base = apiBase();
  if (!base || !isPayHubApiConfigured()) {
    throw new Error("Pay Hub API not configured");
  }

  const token = await getPayHubAuthToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${base}/pay/swap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mode: "onchain",
      from,
      to,
      txHash,
      walletAddress,
    }),
  });

  const data = await res.json().catch(() => ({})) as SwapResult & {
    error?: string;
    fromAmount?: number;
    outboundTxHash?: string;
  };
  if (!res.ok) throw new Error(data.error || "Swap failed");

  return {
    from,
    to,
    fromAmount: data.fromAmount ?? 0,
    netToAmount: data.netToAmount ?? 0,
    feeAmount: data.feeAmount ?? 0,
    source: "wallet",
    txHash: data.outboundTxHash ?? txHash,
  };
}

export function resolveSwapSource(
  _from: SwapSymbol,
  _amount: number,
  _walletBalance: number,
  _ledger: PayLedgerSnapshot | null,
): SwapSource {
  return "wallet";
}

export const isSwapPairSupported = (from: string, to: string): boolean => {
  const pair = new Set([from.toUpperCase(), to.toUpperCase()]);
  return pair.has("GAT") && pair.has("SDA");
};
