import { waitForAuthUser } from "../firebase/waitForAuthUser";
import type { KycApplication } from "./kycApplicationService";

export type KycSubmitPayload = Omit<KycApplication, "uid" | "submittedAt" | "status" | "tier">;

const API_BASE = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "") ?? "";

function submitEndpoint(): string {
  if (API_BASE) return `${API_BASE}/kyc/submit`;
  return "/api/kyc/submit";
}

/** Production & dev with Pay Hub API, bypasses client Firestore rules (reliable on mobile PWA). */
export function isKycServerSubmitAvailable(): boolean {
  return typeof window !== "undefined" && (Boolean(API_BASE) || import.meta.env.DEV);
}

export async function submitKycViaServerApi(
  payload: KycSubmitPayload,
): Promise<{ ok: true; status: "pending" }> {
  const user = await waitForAuthUser();
  const token = await user.getIdToken(true);

  const res = await fetch(submitEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !body.ok) {
    throw new Error(body.error ?? `Submit KYC gagal (${res.status})`);
  }
  return { ok: true, status: "pending" };
}
