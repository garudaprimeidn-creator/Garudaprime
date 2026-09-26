import { getPayHubAuthToken, isPayHubApiConfigured } from "./payHubApi";

export type WalletActivationResponse = {
  ok?: boolean;
  enabled?: boolean;
  granted?: boolean;
  skipped?: boolean;
  reason?: string;
  txHash?: string;
  amountSda?: number;
  nativeBalanceSda?: number;
  error?: string;
};

export async function requestWalletActivation(
  address: string,
): Promise<WalletActivationResponse | null> {
  if (!isPayHubApiConfigured() || !address?.startsWith("0x")) return null;

  const token = await getPayHubAuthToken();
  if (!token) return null;

  const base = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");
  if (!base) return null;

  const res = await fetch(`${base}/wallet/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ address }),
  });

  const data = (await res.json().catch(() => ({}))) as WalletActivationResponse;
  if (!res.ok) {
    return { ...data, granted: false, skipped: true, error: data.error ?? res.statusText };
  }
  return data;
}

/** Top-up SDA for Garuda native wallet gas before send/pay (repeatable paymaster). */
export async function requestGarudaGasTopUp(
  address: string,
  tx?: { to?: string; data?: string; value?: string },
): Promise<{ ok?: boolean; sponsored?: boolean; balanceSda?: number; error?: string } | null> {
  if (!isPayHubApiConfigured() || !address?.startsWith("0x")) return null;

  const token = await getPayHubAuthToken();
  if (!token) return null;

  const base = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");
  if (!base) return null;

  const post = () => fetch(`${base}/wallet/garuda/gas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ address, txCount: tx ? 1 : 2, ...tx }),
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await post();
    const data = await res.json().catch(() => ({})) as {
      ok?: boolean;
      sponsored?: boolean;
      balanceSda?: number;
      error?: string;
    };
    if (res.ok) return data;
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1200 + attempt * 800));
      continue;
    }
    return { ...data, error: data.error ?? res.statusText };
  }
  return null;
}
