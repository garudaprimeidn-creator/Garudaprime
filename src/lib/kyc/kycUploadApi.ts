import { waitForAuthUser } from "../firebase/waitForAuthUser";
import type { KycUploadKind } from "./kycStorageService";

const API_BASE = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "") ?? "";

function uploadEndpoint(): string {
  if (API_BASE) return `${API_BASE}/kyc/upload`;
  return "/api/kyc/upload";
}

export async function uploadKycViaServerApi(
  kind: KycUploadKind,
  dataUrl: string,
): Promise<string> {
  const user = await waitForAuthUser();
  const token = await user.getIdToken(true);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);

  try {
    const res = await fetch(uploadEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ kind, dataUrl }),
      signal: controller.signal,
    });

    const payload = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !payload.url) {
      throw new Error(payload.error ?? `Upload server gagal (${res.status})`);
    }
    return payload.url;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Upload server timeout, coba lagi");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
