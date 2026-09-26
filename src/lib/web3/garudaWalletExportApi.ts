import { getPayHubAuthToken, isPayHubApiConfigured } from "../payhub/payHubApi";
import { garudaDeviceId, obtainGarudaSignToken } from "./garudaWalletSignGate";

export type GarudaWalletExportPayload = {
  address: string;
  privateKey: string;
  recoveryPhrase: string;
  network: string;
  chainId: number;
  exportedAt: string;
};

const apiBase = () => import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "") ?? "";

export async function exportGarudaPrimeWalletSecrets(
  uid: string,
  address: string,
): Promise<GarudaWalletExportPayload> {
  const base = apiBase();
  if (!base || !isPayHubApiConfigured()) {
    throw new Error("Pay Hub API not configured");
  }

  const idToken = await getPayHubAuthToken();
  if (!idToken) throw new Error("Not authenticated");

  const signToken = await obtainGarudaSignToken(idToken, address, uid);
  const res = await fetch(`${base}/wallet/garuda/export`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      "X-Garuda-Device-Id": garudaDeviceId(),
    },
    body: JSON.stringify({ signToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to export Garuda wallet secrets");
  }
  return data as GarudaWalletExportPayload;
}
