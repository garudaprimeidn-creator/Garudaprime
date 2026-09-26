import { getPayHubAuthToken, invalidatePayHubAuthToken, isPayHubApiConfigured } from "./payHubApi";

export type PayLedgerSnapshot = {
  gatBalance: number;
  /** GAT in pay ledger only (excludes merchant pool), used for swap/withdraw checks. */
  ledgerGat?: number;
  /** GAT pooled in pay_merchants docs for this owner */
  merchantPoolGat?: number;
  onChainGat?: number;
  fsLedgerGat?: number;
  onChainWallet?: string | null;
  payHubApprovalSufficient?: boolean;
  fsLedgerDeprecated?: boolean;
  sdaBalance: number;
  withdrawEnabled: boolean;
  depositEnabled: boolean;
  depositAddress: string | null;
  minWithdrawGat: number;
  minDepositGat: number;
  swapEnabled?: boolean;
};

export const EMPTY_PAY_LEDGER: PayLedgerSnapshot = {
  gatBalance: 0,
  sdaBalance: 0,
  withdrawEnabled: false,
  depositEnabled: false,
  depositAddress: null,
  minWithdrawGat: 1,
  minDepositGat: 1,
  swapEnabled: false,
};

/** Optimistic ledger when API is up but ledger fetch has not completed yet. */
export const defaultPayHubLedger = (): PayLedgerSnapshot => {
  const treasury = resolvePayHubTreasuryAddress(null);
  return {
    ...EMPTY_PAY_LEDGER,
    depositAddress: treasury,
    depositEnabled: isPayHubDepositUiReady(null),
    withdrawEnabled: isPayHubApiConfigured(),
    swapEnabled: isPayHubApiConfigured(),
  };
};

export type PayHubWithdrawResult = {
  ok: boolean;
  amountGat: number;
  txHash: string;
  gatBalance: number;
};

export type PayHubWithdrawSdaResult = {
  ok: boolean;
  amountSda: number;
  txHash: string;
  sdaBalance: number;
  gatBalance: number;
};

export type PayHubDepositResult = {
  ok: boolean;
  grossAmountGat: number;
  feeAmountGat: number;
  netAmountGat: number;
  txHash: string;
  gatBalance: number;
};

function apiBase(): string | null {
  const base = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");
  return base || null;
}

/** Treasury for on-chain GAT deposits, ledger API first, then client env. */
export function resolvePayHubTreasuryAddress(ledger?: PayLedgerSnapshot | null): string | null {
  const fromLedger = ledger?.depositAddress?.trim();
  if (fromLedger?.startsWith("0x")) return fromLedger;
  const fromEnv =
    import.meta.env.VITE_PAY_HUB_BACKING_ADDRESS?.trim()
    || import.meta.env.VITE_GAT_TREASURY_ADDRESS?.trim();
  if (fromEnv?.startsWith("0x")) return fromEnv;
  return null;
}

export const isPayHubDepositUiReady = (ledger?: PayLedgerSnapshot | null): boolean =>
  Boolean(resolvePayHubTreasuryAddress(ledger))
  && Boolean(import.meta.env.VITE_GAT_TOKEN_ADDRESS?.trim()?.startsWith("0x"));

export const normalizePayHubLedger = (data: PayLedgerSnapshot): PayLedgerSnapshot => {
  const treasury = resolvePayHubTreasuryAddress(data);
  return {
    ...data,
    depositAddress: treasury,
    depositEnabled: Boolean(data.depositEnabled || treasury),
    swapEnabled: isPayHubApiConfigured(),
  };
};

async function fetchPayHubJson<T>(path: string, init?: RequestInit, timeoutMs = 8_000): Promise<T | null> {
  const base = apiBase();
  if (!base) return null;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    let token = await getPayHubAuthToken();
    if (!token) return null;

    let res = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 401) {
      invalidatePayHubAuthToken();
      token = await getPayHubAuthToken(true);
      if (!token) return null;
      res = await fetch(`${base}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
      });
    }

    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchPayLedger(): Promise<PayLedgerSnapshot | null> {
  if (!isPayHubApiConfigured()) return null;
  const data = await fetchPayHubJson<PayLedgerSnapshot>("/pay/ledger", { method: "GET" });
  if (!data) return null;
  return normalizePayHubLedger(data);
}

export async function withdrawPayHubToWallet(
  amountGat: number,
  walletAddress: string,
): Promise<PayHubWithdrawResult> {
  const base = apiBase();
  if (!base || !isPayHubApiConfigured()) {
    throw new Error("Pay Hub API not configured");
  }

  const token = await getPayHubAuthToken();
  if (!token) throw new Error("Not authenticated");

  const post = async (authToken: string) => fetch(`${base}/pay/ledger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ amount: amountGat, walletAddress }),
  });

  let res = await post(token);
  if (res.status === 401) {
    const { invalidatePayHubAuthToken } = await import("./payHubApi");
    invalidatePayHubAuthToken();
    const retryToken = await getPayHubAuthToken(true);
    if (!retryToken) throw new Error("Not authenticated");
    res = await post(retryToken);
  }

  const data = await res.json().catch(() => ({})) as PayHubWithdrawResult & { error?: string };
  if (!res.ok) throw new Error(data.error || "Withdraw failed");
  return data;
}

export async function withdrawPayHubSdaToWallet(
  amountSda: number,
  walletAddress: string,
): Promise<PayHubWithdrawSdaResult> {
  const base = apiBase();
  if (!base || !isPayHubApiConfigured()) {
    throw new Error("Pay Hub API not configured");
  }

  const token = await getPayHubAuthToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${base}/pay/ledger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amount: amountSda, walletAddress, asset: "SDA" }),
  });

  const data = await res.json().catch(() => ({})) as PayHubWithdrawSdaResult & { error?: string };
  if (!res.ok) throw new Error(data.error || "Withdraw failed");
  return data;
}

export async function depositPayHubFromWallet(
  txHash: string,
  walletAddress: string,
): Promise<PayHubDepositResult> {
  const base = apiBase();
  if (!base || !isPayHubApiConfigured()) {
    throw new Error("Pay Hub API not configured");
  }

  const token = await getPayHubAuthToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${base}/pay/deposit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ txHash, walletAddress }),
  });

  const data = await res.json().catch(() => ({})) as PayHubDepositResult & { error?: string };
  if (!res.ok) throw new Error(data.error || "Deposit failed");
  return data;
}
