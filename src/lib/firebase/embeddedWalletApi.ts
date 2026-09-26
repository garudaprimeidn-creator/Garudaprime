const API_BASE = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");

export async function bindEmbeddedWalletOnServer(
  address: string,
  idToken: string,
  externalUserId?: string,
): Promise<{ ok: boolean; bindingId?: string }> {
  const base = API_BASE;
  if (!base || !idToken) return { ok: false };

  const res = await fetch(`${base}/wallet/embedded/bind`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ address, externalUserId }),
  });
  if (!res.ok) return { ok: false };
  const data = await res.json();
  return { ok: Boolean(data.ok), bindingId: data.bindingId };
}
