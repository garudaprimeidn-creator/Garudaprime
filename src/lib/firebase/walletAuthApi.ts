const API_BASE = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");

export type WalletAuthExchangePayload = {
  address: string;
  message: string;
  signature: string;
  provider: string;
};

export const isWalletAuthApiConfigured = () => Boolean(API_BASE);

export async function fetchWalletAuthNonce(address: string): Promise<{ nonce: string; issuedAt: string }> {
  if (!API_BASE) throw new Error("Pay Hub API not configured");
  const res = await fetch(`${API_BASE}/auth/wallet/nonce?address=${encodeURIComponent(address)}`);
  const data = (await res.json()) as { nonce?: string; issuedAt?: string; error?: string };
  if (!res.ok || !data.nonce || !data.issuedAt) {
    throw new Error(data.error ?? "Failed to fetch wallet nonce");
  }
  return { nonce: data.nonce, issuedAt: data.issuedAt };
}

export async function exchangeWalletAuthToken(
  payload: WalletAuthExchangePayload,
): Promise<string> {
  if (!API_BASE) {
    throw Object.assign(new Error("Pay Hub API not configured"), { code: "wallet/auth-api-unavailable" });
  }

  const res = await fetch(`${API_BASE}/auth/wallet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as { customToken?: string; error?: string };
  if (!res.ok || !data.customToken) {
    throw Object.assign(
      new Error(data.error ?? "Wallet auth failed"),
      { code: "wallet/auth-exchange-failed" },
    );
  }
  return data.customToken;
}
