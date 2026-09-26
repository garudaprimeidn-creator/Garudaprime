import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import { sendTransactionalEmail } from "./emailDeliveryCore.js";
import { buildWalletOtpEmail } from "./walletOtpEmailTemplate.js";

const OTP_DOC = "wallet_create_otp";
const SESSION_DOC = "wallet_create_otp_sessions";

const OTP_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

type OtpDoc = {
  email: string;
  codeHash: string;
  expiresAt: number;
  sentAt: number;
  attempts: number;
};

type SessionDoc = {
  uid: string;
  email: string;
  expiresAt: number;
  used: boolean;
};

const otpSecret = (): string =>
  process.env.WALLET_OTP_SECRET?.trim()
  || process.env.GARUDA_WALLET_OTP_SECRET?.trim()
  || "garuda-wallet-otp-v1";

export const isWalletCreateOtpRequired = (): boolean => {
  const raw = process.env.GARUDA_WALLET_OTP_REQUIRED?.trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  return true;
};

const hashCode = (uid: string, code: string): string =>
  crypto.createHash("sha256").update(`${uid}:${code}:${otpSecret()}`).digest("hex");

export const maskEmail = (email: string): string => {
  const trimmed = email.trim();
  const [local, domain] = trimmed.split("@");
  if (!local || !domain) return trimmed;
  const head = local.slice(0, Math.min(2, local.length));
  const tail = local.length > 2 ? local.slice(-1) : "";
  return `${head}${"*".repeat(Math.max(3, local.length - head.length - tail.length))}${tail}@${domain}`;
};

const generateCode = (): string =>
  String(Math.floor(100000 + Math.random() * 900000));

async function resolveUserEmail(uid: string, tokenEmail?: string | null): Promise<string> {
  const fromToken = tokenEmail?.trim();
  if (fromToken?.includes("@")) return fromToken.toLowerCase();

  const snap = await adminDb().collection("users").doc(uid).get();
  const fromProfile = String(snap.data()?.email ?? "").trim().toLowerCase();
  if (fromProfile.includes("@")) return fromProfile;

  throw new Error("Email akun diperlukan untuk verifikasi OTP dompet");
}

async function deliverOtpEmail(email: string, code: string, lang: "id" | "en"): Promise<void> {
  const { subject, text, html } = buildWalletOtpEmail(code, lang);
  await sendTransactionalEmail({ to: email, subject, text, html });

  if (process.env.GARUDA_WALLET_OTP_LOG === "true") {
    console.info("[Garuda Wallet OTP]", code, "→", email);
  }
}

export async function sendWalletCreateOtp(
  uid: string,
  tokenEmail: string | null | undefined,
  lang: "id" | "en" = "id",
): Promise<{ maskedEmail: string; resendSec: number }> {
  const email = await resolveUserEmail(uid, tokenEmail);
  const ref = adminDb().collection(OTP_DOC).doc(uid);
  const snap = await ref.get();
  const now = Date.now();

  if (snap.exists) {
    const prev = snap.data() as OtpDoc;
    const resendLeft = RESEND_COOLDOWN_MS - (now - (prev.sentAt ?? 0));
    if (resendLeft > 0) {
      return { maskedEmail: maskEmail(email), resendSec: Math.ceil(resendLeft / 1000) };
    }
  }

  const code = generateCode();
  const record: OtpDoc = {
    email,
    codeHash: hashCode(uid, code),
    expiresAt: now + OTP_TTL_MS,
    sentAt: now,
    attempts: 0,
  };

  await deliverOtpEmail(email, code, lang);
  await ref.set(record, { merge: false });

  return { maskedEmail: maskEmail(email), resendSec: 60 };
}

export async function verifyWalletCreateOtp(
  uid: string,
  code: string,
): Promise<{ otpSession: string }> {
  const trimmed = code.replace(/\D/g, "");
  if (trimmed.length !== 6) {
    throw new Error("Kode OTP harus 6 digit");
  }

  const ref = adminDb().collection(OTP_DOC).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("OTP belum dikirim, minta kode baru");
  }

  const data = snap.data() as OtpDoc;
  const now = Date.now();
  if (now > data.expiresAt) {
    await ref.delete().catch(() => undefined);
    throw new Error("Kode OTP kedaluwarsa, kirim ulang");
  }

  if ((data.attempts ?? 0) >= MAX_VERIFY_ATTEMPTS) {
    await ref.delete().catch(() => undefined);
    throw new Error("Terlalu banyak percobaan, kirim ulang OTP");
  }

  if (hashCode(uid, trimmed) !== data.codeHash) {
    await ref.set({ attempts: (data.attempts ?? 0) + 1 }, { merge: true });
    throw new Error("Kode OTP tidak valid");
  }

  await ref.delete().catch(() => undefined);

  const otpSession = crypto.randomBytes(24).toString("hex");
  const sessionRef = adminDb().collection(SESSION_DOC).doc(otpSession);
  const session: SessionDoc = {
    uid,
    email: data.email,
    expiresAt: now + SESSION_TTL_MS,
    used: false,
  };
  await sessionRef.set(session);

  return { otpSession };
}

export async function consumeWalletCreateOtpSession(
  uid: string,
  otpSession: string,
): Promise<boolean> {
  if (!isWalletCreateOtpRequired()) return true;
  const token = otpSession?.trim();
  if (!token) return false;

  const ref = adminDb().collection(SESSION_DOC).doc(token);
  const snap = await ref.get();
  if (!snap.exists) return false;

  const data = snap.data() as SessionDoc;
  if (data.uid !== uid || data.used || Date.now() > data.expiresAt) {
    await ref.delete().catch(() => undefined);
    return false;
  }

  await ref.set({ used: true, consumedAt: FieldValue.serverTimestamp() }, { merge: true });
  return true;
}
