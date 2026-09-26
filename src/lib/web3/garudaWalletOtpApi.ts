const API_BASE = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");

export type WalletOtpSendResult = {
  ok: boolean;
  maskedEmail: string;
  resendSec: number;
};

export type WalletOtpVerifyResult = {
  ok: boolean;
  otpSession: string;
};

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = API_BASE;
  if (!base) {
    throw Object.assign(new Error("Pay Hub API not configured"), { code: "garuda/api-missing" });
  }
  const { getPayHubAuthToken } = await import("../payhub/payHubApi");
  let token = await getPayHubAuthToken();
  if (!token) {
    await new Promise((r) => setTimeout(r, 800));
    token = await getPayHubAuthToken(true);
  }
  if (!token) {
    throw Object.assign(new Error("Login diperlukan"), { code: "auth/not-signed-in" });
  }
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const raw = await res.text().catch(() => "");
  let data = {} as T & { error?: string };
  try {
    data = raw ? JSON.parse(raw) as T & { error?: string } : {};
  } catch {
    data = {} as T & { error?: string };
  }
  if (!res.ok) {
    const serverMsg = data.error?.trim();
    const fallback = res.status >= 500
      ? "Layanan OTP dompet sedang gangguan · coba lagi sebentar"
      : "Wallet OTP request failed";
    const isInvalidOtp = res.status === 400 && /otp|kode|digit|valid|kedaluwarsa|expired/i.test(serverMsg ?? "");
    throw Object.assign(new Error(serverMsg || fallback), {
      code: res.status === 401
        ? "auth/not-signed-in"
        : isInvalidOtp
          ? "garuda/otp-invalid"
          : "garuda/otp-failed",
    });
  }
  return data;
}

export async function sendGarudaWalletCreateOtp(lang: "id" | "en"): Promise<WalletOtpSendResult> {
  return authFetch<WalletOtpSendResult>("/wallet/garuda/otp/send", {
    method: "POST",
    body: JSON.stringify({ lang }),
  });
}

export async function verifyGarudaWalletCreateOtp(code: string): Promise<WalletOtpVerifyResult> {
  return authFetch<WalletOtpVerifyResult>("/wallet/garuda/otp/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}
