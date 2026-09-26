import { auth, isFirebaseConfigured } from "../firebase/config";
import { onAuthStateChanged } from "firebase/auth";
import { refreshSessionToken } from "../security/sessionManager";

const API_BASE = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");

export const isPayHubApiConfigured = () => Boolean(API_BASE);

type CachedToken = { value: string; expiresAt: number };

let cachedToken: CachedToken | null = null;
let inflightToken: Promise<string | null> | null = null;

const waitForAuthUser = (timeoutMs = 1_500): Promise<boolean> =>
  new Promise((resolve) => {
    if (!auth) {
      resolve(false);
      return;
    }
    if (auth.currentUser) {
      resolve(true);
      return;
    }
    const timer = window.setTimeout(() => {
      unsub();
      resolve(Boolean(auth.currentUser));
    }, timeoutMs);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        window.clearTimeout(timer);
        unsub();
        resolve(true);
      }
    });
  });

function tokenExpiresAtMs(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? "")) as { exp?: number };
    if (typeof payload.exp === "number") return payload.exp * 1000;
  } catch { /* ignore */ }
  return Date.now() + 5 * 60 * 1000;
}

export function invalidatePayHubAuthToken(): void {
  cachedToken = null;
}

/** Prefetch Firebase ID token so Pay Hub debits start without auth delay. */
export function warmupPayHubAuthToken(): void {
  if (!isPayHubApiConfigured()) return;
  void getPayHubAuthToken().catch(() => null);
}

/** Firebase ID token for Pay Hub API, cached by default; pass forceRefresh after 401. */
export async function getPayHubAuthToken(forceRefresh = false): Promise<string | null> {
  if (!isFirebaseConfigured || !auth) return null;

  if (
    !forceRefresh
    && cachedToken
    && cachedToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedToken.value;
  }

  if (inflightToken && !forceRefresh) return inflightToken;

  inflightToken = (async () => {
    if (!auth?.currentUser) {
      await waitForAuthUser();
      if (!auth?.currentUser) await refreshSessionToken();
    }
    if (!auth?.currentUser) return null;

    try {
      const token = await auth.currentUser.getIdToken(forceRefresh);
      cachedToken = { value: token, expiresAt: tokenExpiresAtMs(token) };
      return token;
    } catch {
      if (!forceRefresh) {
        await refreshSessionToken();
        if (!auth?.currentUser) return null;
        try {
          const token = await auth.currentUser.getIdToken(true);
          cachedToken = { value: token, expiresAt: tokenExpiresAtMs(token) };
          return token;
        } catch {
          return null;
        }
      }
      return null;
    } finally {
      inflightToken = null;
    }
  })();

  return inflightToken;
}

export class PayHubApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "PayHubApiError";
    this.status = status;
    this.code = code;
  }
}

const mapPayHubApiError = (status: number, message: string): PayHubApiError => {
  const lower = message.toLowerCase();
  if (
    status === 401
    || lower.includes("unauthorized")
    || lower.includes("id token")
    || lower.includes("unauthenticated")
  ) {
    return new PayHubApiError(
      "Sesi login kedaluwarsa, keluar lalu masuk kembali untuk Pay Hub",
      status,
      "payhub/auth",
    );
  }
  if (lower.includes("insufficient gat balance")) {
    return new PayHubApiError("Saldo GAT Pay Hub tidak cukup", status, "payhub/insufficient");
  }
  if (lower.includes("approval required") || lower.includes("approve pay hub")) {
    return new PayHubApiError(
      "Persetujuan GAT diperlukan, setujui di dompet untuk Pay Hub",
      status,
      "payhub/approval-required",
    );
  }
  if (
    lower.includes("resource_exhausted")
    || lower.includes("quota exceeded")
    || lower.includes("layanan sibuk")
    || /^\d+\s+resource_exhausted/.test(lower)
  ) {
    return new PayHubApiError(
      "Layanan sibuk, tunggu 1-2 menit lalu coba lagi",
      status,
      "payhub/quota",
    );
  }
  if (lower.includes("sda amount must be") || lower.includes("relayer: sda")) {
    return new PayHubApiError(
      "Gas Sidra sedang disponsori, coba lagi dalam beberapa detik",
      status,
      "payhub/gas",
    );
  }
  if (lower.includes("menunggu konfirmasi sidra")) {
    return new PayHubApiError(message, status, "payhub/pending");
  }
  return new PayHubApiError(message, status);
};

export type ApiSettlePayload = {
  channel: "onchain" | "offchain";
  amount: string;
  merchantId: string;
  payerAddress: string;
  recipientVault?: string;
  txHash?: string;
  invoiceId?: string;
  invoiceNote?: string;
};

export type ApiSettleResponse = {
  receipt: {
    id: string;
    channel: "onchain" | "offchain";
    merchantId: string;
    merchantName: string;
    amount: string;
    token: "GAT";
    payerAddress: string;
    status: "confirmed" | "pending" | "failed";
    receiptCode: string;
    txHash?: string | null;
    onChainTxHash?: string | null;
    feeAmount?: number | null;
    grossAmount?: number | null;
    createdAt: number;
  };
  simulated: boolean;
};

const PAY_HUB_TIMEOUT_MS: Record<string, number> = {
  "/pay/settle": 28_000,
  "/pay/transfer": 28_000,
  "/pay/swap": 22_000,
};

const isAbortError = (err: unknown): boolean => {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  return msg.includes("signal is aborted") || msg.includes("aborted");
};

async function payHubFetch(
  path: string,
  init: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  if (!API_BASE) throw new Error("Pay Hub API not configured");

  const resolvedTimeout = timeoutMs ?? PAY_HUB_TIMEOUT_MS[path] ?? 12_000;
  const controller = new AbortController();
  const timer = window.setTimeout(() => {
    controller.abort(
      new DOMException("Pay Hub request timed out", "TimeoutError"),
    );
  }, resolvedTimeout);

  try {
    let token = await getPayHubAuthToken();
    if (!token) throw new PayHubApiError("Not authenticated", 401, "payhub/auth");

    const request = (authToken: string) => fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${authToken}`,
      },
    });

    let res = await request(token);

    if (res.status === 401) {
      invalidatePayHubAuthToken();
      token = await getPayHubAuthToken(true);
      if (!token) throw new PayHubApiError("Not authenticated", 401, "payhub/auth");
      res = await request(token);
    }

    return res;
  } catch (err) {
    if (isAbortError(err)) {
      throw new PayHubApiError(
        path === "/pay/settle"
          ? "Pembayaran membutuhkan waktu lebih lama, cek riwayat dompet sebelum mencoba lagi"
          : "Permintaan Pay Hub habis waktu, coba lagi",
        408,
        "payhub/timeout",
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function settleViaPayHubApi(
  payload: ApiSettlePayload,
): Promise<ApiSettleResponse> {
  const res = await payHubFetch("/pay/settle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) {
    throw mapPayHubApiError(res.status, data.error || `Pay Hub API error (${res.status})`);
  }
  return data as ApiSettleResponse;
}

export async function fetchPayReceipt(receiptCode: string, idToken?: string) {
  if (!API_BASE) return null;
  const res = idToken
    ? await fetch(`${API_BASE}/pay/receipt/${encodeURIComponent(receiptCode)}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    : await payHubFetch(`/pay/receipt/${encodeURIComponent(receiptCode)}`, { method: "GET" });
  if (!res.ok) return null;
  return res.json();
}

export async function linkMerchantOwner(merchantId: string, idToken?: string) {
  if (!API_BASE) throw new Error("Pay Hub API not configured");
  const res = idToken
    ? await fetch(`${API_BASE}/pay/merchant/link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ merchantId }),
    })
    : await payHubFetch("/pay/merchant/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantId }),
    });
  const data = await res.json().catch(() => ({})) as { error?: string; ledger?: { gatBalance?: number } };
  if (!res.ok) {
    throw mapPayHubApiError(res.status, data.error || `Link merchant failed (${res.status})`);
  }
  return data;
}

export type PayHubTransferResult = {
  ok: boolean;
  transferId: string;
  recipientUid: string;
  refId: string;
  grossAmount: number;
  netAmount: number;
  feeAmount: number;
  gatBalance: number;
  onChainTxHash?: string | null;
};

export async function transferPayHubGat(
  recipientAddress: string,
  amount: number,
): Promise<PayHubTransferResult> {
  const res = await payHubFetch("/pay/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipientAddress, amount }),
  });
  const data = await res.json().catch(() => ({})) as PayHubTransferResult & { error?: string };
  if (!res.ok) {
    throw mapPayHubApiError(res.status, data.error || `Pay Hub transfer failed (${res.status})`);
  }
  return data;
}

export async function lookupMerchantForPayApi(input: {
  merchantId?: string;
  vault?: string;
}): Promise<{ merchantId: string; name?: string; walletAddress?: string | null } | null> {
  if (!API_BASE) return null;
  const params = new URLSearchParams();
  if (input.merchantId?.trim()) params.set("merchantId", input.merchantId.trim());
  if (input.vault?.trim()) params.set("vault", input.vault.trim());
  if (!params.toString()) return null;

  const res = await fetch(`${API_BASE}/pay/merchant/lookup?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({})) as {
    merchantId?: string;
    name?: string;
    walletAddress?: string | null;
    error?: string;
  };
  if (!res.ok || !data.merchantId) return null;
  return {
    merchantId: data.merchantId,
    name: data.name,
    walletAddress: data.walletAddress,
  };
}

export async function ensurePersonalMerchantApi(displayName?: string) {
  if (!API_BASE) throw new Error("Pay Hub API not configured");
  const res = await payHubFetch("/pay/merchant/ensure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  const data = await res.json().catch(() => ({})) as {
    error?: string;
    merchant?: { merchantId: string; name?: string };
    ledger?: { gatBalance?: number };
  };
  if (!res.ok) {
    throw mapPayHubApiError(res.status, data.error || `Ensure merchant failed (${res.status})`);
  }
  return data;
}

export async function updateMerchantProfileApi(input: {
  name?: string;
  shopSymbol?: string;
  shopLocation?: string;
}): Promise<{ merchantId: string; name?: string; shopSymbol?: string | null; shopLocation?: string | null; invoicePrefix?: string | null } | null> {
  if (!API_BASE) return null;
  const res = await payHubFetch("/pay/merchant/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({})) as {
    error?: string;
    merchant?: {
      merchantId: string;
      name?: string;
      shopSymbol?: string | null;
      shopLocation?: string | null;
      invoicePrefix?: string | null;
    };
  };
  if (!res.ok) {
    throw mapPayHubApiError(res.status, data.error || `Update merchant profile failed (${res.status})`);
  }
  return data.merchant ?? null;
}
