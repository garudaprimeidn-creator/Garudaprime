const API_BASE = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");

export type GarudaWalletConfig = {
  enabled: boolean;
  vendor: "garuda";
  providerType: string;
  chainId: number;
  network: string;
  autoOnKyc: boolean;
  signingMode: string;
};

export type GarudaWalletCreateResult = {
  ok: boolean;
  address: string;
  publicKey: string;
  provider: string;
  network: string;
  chainId: number;
  status: string;
};

function apiBase(): string | null {
  return API_BASE || null;
}

export async function fetchGarudaWalletConfig(): Promise<GarudaWalletConfig | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/wallet/garuda/config`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function createGarudaNativeWallet(
  idToken: string,
  otpSession?: string,
): Promise<GarudaWalletCreateResult> {
  const base = apiBase();
  if (!base) {
    throw Object.assign(new Error("Pay Hub API not configured"), { code: "garuda/api-missing" });
  }
  const res = await fetch(`${base.replace(/\/$/, "")}/wallet/garuda/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(otpSession ? { otpSession } : {}),
  });
  const data = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) {
    const detail = data.error?.trim() || "Garuda wallet create failed";
    const needsOtp = res.status === 403 && /otp/i.test(detail);
    throw Object.assign(new Error(detail), {
      code: needsOtp
        ? "garuda/otp-required"
        : res.status === 403
          ? "garuda/kyc-required"
          : "garuda/create-failed",
    });
  }
  return data as GarudaWalletCreateResult;
}

export async function requestGarudaSignChallenge(
  idToken: string,
  address: string,
  deviceId: string,
): Promise<{ signToken: string; expiresAt: number; address: string }> {
  const base = apiBase();
  if (!base) {
    throw Object.assign(new Error("Pay Hub API not configured"), { code: "garuda/api-missing" });
  }
  const res = await fetch(`${base}/wallet/garuda/challenge`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      "X-Garuda-Device-Id": deviceId,
    },
    body: JSON.stringify({ address }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({})) as {
    error?: string;
    signToken?: string;
    expiresAt?: number;
    address?: string;
  };
  if (!res.ok) {
    const detail = data.error?.trim()
      || (res.status === 0 ? "Koneksi ke server gagal, cek jaringan lalu coba lagi" : `Sign challenge HTTP ${res.status}`);
    throw Object.assign(new Error(detail), {
      code: "garuda/challenge-failed",
    });
  }
  if (!data.signToken) {
    throw Object.assign(new Error("Garuda sign challenge failed"), { code: "garuda/challenge-failed" });
  }
  return {
    signToken: data.signToken,
    expiresAt: data.expiresAt ?? Date.now() + 300_000,
    address: data.address?.trim() || address,
  };
}

export async function signGarudaWalletRequest(
  idToken: string,
  input: {
    address: string;
    method: string;
    transaction?: Record<string, string>;
    message?: string;
    signToken?: string;
  },
): Promise<{ txHash?: string; signature?: string }> {
  const base = await apiBase();
  if (!base) {
    throw Object.assign(new Error("Pay Hub API not configured"), { code: "garuda/api-missing" });
  }
  const res = await fetch(`${base.replace(/\/$/, "")}/wallet/garuda/sign`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error ?? "Garuda wallet sign failed"), {
      code: "garuda/sign-failed",
    });
  }
  return data;
}
