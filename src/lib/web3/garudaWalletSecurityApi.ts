import { getPayHubAuthToken, isPayHubApiConfigured } from "../payhub/payHubApi";
import { garudaDeviceId, obtainGarudaSignToken } from "./garudaWalletSignGate";

export type GarudaWalletSecuritySummary = {
  enabled?: boolean;
  hasWallet: boolean;
  autoOnKyc?: boolean;
  address?: string;
  status?: "active" | "frozen" | "recovering";
  network?: string;
  chainId?: number;
  signingMode?: string;
  lastSignedAt?: unknown;
  frozenAt?: unknown;
  recoveryRequestedAt?: unknown;
};

const apiBase = () => import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "") ?? "";

export async function fetchGarudaWalletSecurity(): Promise<GarudaWalletSecuritySummary | null> {
  if (!isPayHubApiConfigured()) return null;
  const token = await getPayHubAuthToken();
  if (!token) return null;
  const base = apiBase();
  if (!base) return null;

  const res = await fetch(`${base}/wallet/garuda/security`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  return await res.json() as GarudaWalletSecuritySummary;
}

export async function freezeGarudaNativeWallet(address: string, uid: string): Promise<void> {
  const base = apiBase();
  if (!base) throw new Error("Pay Hub API not configured");

  const idToken = await getPayHubAuthToken();
  if (!idToken) throw new Error("Not authenticated");

  const signToken = await obtainGarudaSignToken(idToken, address, uid);
  const res = await fetch(`${base}/wallet/garuda/freeze`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      "X-Garuda-Device-Id": garudaDeviceId(),
    },
    body: JSON.stringify({ signToken, reason: "user_security_center" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "Freeze failed");
  }
}

export async function requestGarudaWalletRecovery(note?: string): Promise<void> {
  const base = apiBase();
  if (!base) throw new Error("Pay Hub API not configured");

  const idToken = await getPayHubAuthToken();
  if (!idToken) throw new Error("Not authenticated");

  const res = await fetch(`${base}/wallet/garuda/recovery`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ note }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "Recovery request failed");
  }
}
