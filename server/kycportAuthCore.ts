import { adminAuth } from "./firebaseAdmin.js";
import {
  exchangeKycPortCodeServer,
  fetchKycPortKycServer,
  fetchKycPortUserServer,
  normalizeKycPortKyc,
  normalizeKycPortUser,
} from "./kycportCore.js";

export function uidFromKycPortUserId(kycportUserId: string): string {
  const raw = kycportUserId.trim();
  if (!raw) return `kycport_${Date.now().toString(36)}`;

  const safe = raw.replace(/[^a-zA-Z0-9@._-]/g, "_");
  if (safe.length <= 100) {
    return safe.startsWith("kycport_") ? safe.slice(0, 128) : `kycport_${safe}`.slice(0, 128);
  }

  let hash = 0;
  for (let i = 0; i < safe.length; i += 1) {
    hash = ((hash << 5) - hash + safe.charCodeAt(i)) | 0;
  }
  return `kycport_${safe.slice(0, 24)}_${Math.abs(hash).toString(36)}`.slice(0, 128);
}

export type KycPortAuthBody = {
  accessToken?: string;
  code?: string;
  codeVerifier?: string;
  redirectUri?: string;
  nonce?: string;
};

export type KycPortAuthResult = {
  customToken: string;
  uid: string;
  user: ReturnType<typeof normalizeKycPortUser> & {
    kycStatus: string;
    kycTier: number;
    verifiedAt: string | null;
  };
};

export async function verifyKycPortAuthPayload(body: KycPortAuthBody): Promise<KycPortAuthResult> {
  let accessToken = String(body.accessToken ?? "").trim();

  if (!accessToken && body.code) {
    const tokenPayload = await exchangeKycPortCodeServer(
      String(body.code).trim(),
      String(body.codeVerifier ?? "").trim(),
      body.redirectUri,
      body.nonce,
    );
    accessToken = String(
      (tokenPayload as { access_token?: string; token?: string }).access_token
      ?? (tokenPayload as { token?: string }).token
      ?? "",
    ).trim();
  }

  if (!accessToken) throw new Error("Missing KYCPORT access token");

  const [userRaw, kycRaw] = await Promise.all([
    fetchKycPortUserServer(accessToken),
    fetchKycPortKycServer(accessToken).catch(() => ({})),
  ]);

  const user = normalizeKycPortUser(userRaw);
  const kyc = normalizeKycPortKyc(kycRaw);
  const identity = user.id || user.email;
  if (!identity) throw new Error("Invalid KYCPORT profile");

  const merged = {
    ...user,
    kycStatus: kyc.status || user.kycStatus,
    kycTier: kyc.tier || user.kycTier,
    verifiedAt: kyc.verifiedAt ?? user.verifiedAt,
  };

  const uid = uidFromKycPortUserId(identity);
  const customToken = await adminAuth().createCustomToken(uid);

  return { customToken, uid, user: merged };
}

export const kycPortAuthErrorStatus = (message: string): number => {
  if (
    message === "Missing KYCPORT access token"
    || message === "Invalid KYCPORT profile"
    || message.includes("KYCPORT API error (400)")
  ) {
    return 400;
  }
  if (message.includes("KYCPORT API error (401)")) return 401;
  return 500;
};
