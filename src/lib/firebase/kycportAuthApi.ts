const API_BASE = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");

export type KycPortAuthExchangeResponse = {
  customToken: string;
  uid: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    phone: string;
    kycStatus: string;
    kycTier: number;
    verifiedAt?: string | null;
  };
};

export type KycPortAuthExchangePayload = {
  accessToken?: string;
  code?: string;
  codeVerifier?: string;
  redirectUri?: string;
  nonce?: string;
};

export const isKycPortAuthApiConfigured = () => Boolean(API_BASE);

export async function exchangeKycPortAuthToken(
  payload: KycPortAuthExchangePayload,
): Promise<KycPortAuthExchangeResponse> {
  if (!API_BASE) throw new Error("Pay Hub API not configured");

  const res = await fetch(`${API_BASE}/auth/kycport`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as KycPortAuthExchangeResponse & { error?: string };
  if (!res.ok || !data.customToken) {
    throw Object.assign(new Error(data.error ?? "KYCPORT auth failed"), {
      code: "kycport/auth-failed",
    });
  }
  return data;
}
