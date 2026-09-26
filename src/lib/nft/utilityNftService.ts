import { getPayHubAuthToken, isPayHubApiConfigured } from "../payhub/payHubApi";
import type { UtilityNftPortfolio } from "./utilityNftTypes";

function apiBase(): string | null {
  return import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "") || null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const base = apiBase();
  if (!base || !isPayHubApiConfigured()) return null;

  const token = await getPayHubAuthToken();
  if (!token) return null;

  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

export async function fetchUtilityNftPortfolio(locale: "id" | "en"): Promise<UtilityNftPortfolio | null> {
  try {
    const res = await authFetch(`/nft/portfolio?locale=${locale}`);
    if (!res?.ok) return null;
    return (await res.json()) as UtilityNftPortfolio;
  } catch {
    return null;
  }
}

export async function syncUtilityNfts(locale: "id" | "en"): Promise<{
  minted: number;
  skipped: number;
  portfolio: UtilityNftPortfolio;
} | null> {
  try {
    const res = await authFetch("/nft/sync", {
      method: "POST",
      body: JSON.stringify({ locale }),
    });
    if (!res?.ok) return null;
    return (await res.json()) as { minted: number; skipped: number; portfolio: UtilityNftPortfolio };
  } catch {
    return null;
  }
}

export function isUtilityNftApiConfigured(): boolean {
  return isPayHubApiConfigured();
}
