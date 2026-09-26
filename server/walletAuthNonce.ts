import { randomBytes } from "crypto";
import { adminDb } from "./firebaseAdmin.js";

const NONCE_COL = "wallet_auth_nonces";
const NONCE_TTL_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 5 * 60 * 1000;

export const APP_AUTH_ORIGIN =
  process.env.VITE_APP_ORIGIN?.replace(/\/$/, "")
  || "https://app.garudaprime.id";

const ALLOWED_AUTH_ORIGINS = (): string[] => {
  const origins = new Set<string>([
    APP_AUTH_ORIGIN,
    "https://app.garudaprime.id",
    "https://garudaprime.id",
    "https://www.garudaprime.id",
  ]);
  const vercelUrl = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercelUrl) origins.add(`https://${vercelUrl}`);
  const branchUrl = process.env.VERCEL_BRANCH_URL?.replace(/\/$/, "");
  if (branchUrl) origins.add(branchUrl.startsWith("http") ? branchUrl : `https://${branchUrl}`);
  return [...origins];
};

const isAllowedAuthOrigin = (origin: string): boolean => {
  const normalized = origin.replace(/\/$/, "");
  if (normalized.startsWith("http://localhost") || normalized.startsWith("http://127.0.0.1")) {
    return true;
  }
  return ALLOWED_AUTH_ORIGINS().some((allowed) => allowed.replace(/\/$/, "") === normalized);
};

export const issueWalletAuthNonce = async (address: string): Promise<{ nonce: string; issuedAt: string }> => {
  const normalized = address.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    throw new Error("Invalid address");
  }

  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  const expiresAt = Date.now() + NONCE_TTL_MS;

  await adminDb().collection(NONCE_COL).doc(normalized).set({
    nonce,
    issuedAt,
    expiresAt,
    used: false,
  });

  return { nonce, issuedAt };
};

export const buildWalletAuthMessage = (input: {
  address: string;
  nonce: string;
  issuedAt: string;
  origin?: string;
}) => {
  const origin = input.origin?.replace(/\/$/, "") || APP_AUTH_ORIGIN;
  return [
    "Garuda Prime Authentication",
    `Address: ${input.address}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Origin: ${origin}`,
  ].join("\n");
};

export const consumeWalletAuthNonce = async (address: string, message: string): Promise<void> => {
  const normalized = address.trim().toLowerCase();
  const snap = await adminDb().collection(NONCE_COL).doc(normalized).get();
  if (!snap.exists) throw new Error("Invalid or expired nonce");

  const data = snap.data()!;
  if (data.used) throw new Error("Nonce already used");
  if (Date.now() > Number(data.expiresAt ?? 0)) throw new Error("Invalid or expired nonce");

  const nonce = String(data.nonce ?? "");
  const issuedAt = String(data.issuedAt ?? "");
  if (!message.includes(`Nonce: ${nonce}`)) throw new Error("Invalid message");
  if (!message.includes(`Issued At: ${issuedAt}`)) throw new Error("Invalid message");
  const originLine = message.split("\n").find((line) => line.startsWith("Origin: "));
  const messageOrigin = originLine?.slice("Origin: ".length).trim() ?? "";
  if (!messageOrigin || !isAllowedAuthOrigin(messageOrigin)) {
    throw new Error("Invalid origin");
  }

  const issuedMs = Date.parse(issuedAt);
  if (!Number.isFinite(issuedMs) || Date.now() - issuedMs > MAX_AGE_MS) {
    throw new Error("Message expired");
  }

  await snap.ref.set({ used: true, usedAt: new Date().toISOString() }, { merge: true });
};
