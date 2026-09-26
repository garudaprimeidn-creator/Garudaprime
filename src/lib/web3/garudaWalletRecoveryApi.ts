import { getPayHubAuthToken, isPayHubApiConfigured } from "../payhub/payHubApi";

const apiBase = () => import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "") ?? "";

export async function verifyGarudaRecoveryAddress(address: string): Promise<boolean> {
  const base = apiBase();
  if (!base || !isPayHubApiConfigured()) {
    throw new Error("Pay Hub API not configured");
  }

  const idToken = await getPayHubAuthToken();
  if (!idToken) throw new Error("Not authenticated");

  const res = await fetch(`${base}/wallet/garuda/verify-recovery`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ address: address.toLowerCase() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "Recovery verification failed");
  }
  return Boolean(data.ok);
}
