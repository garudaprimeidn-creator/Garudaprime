/**
 * Garuda Native Wallet, sign session, device binding, challenge tokens (Phase 2).
 */
import { createHash, randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import { derivedGarudaWalletAddress } from "./garudaWalletCore.js";
import { isFirestoreQuotaError } from "./firestoreQuota.js";

const SESSIONS_COL = "garuda_sign_sessions";
const SIGN_TTL_MS = 5 * 60_000;

type SignSessionRow = {
  uid: string;
  walletAddress: string;
  deviceId: string | null;
  expiresAt: number;
};

const memorySessions = new Map<string, SignSessionRow>();

export function hashDeviceId(deviceId: string): string {
  return createHash("sha256").update(deviceId.trim().toLowerCase()).digest("hex");
}

export async function verifyTrustedDevice(uid: string, deviceId?: string): Promise<boolean> {
  const strict = process.env.GARUDA_WALLET_STRICT_DEVICE?.trim().toLowerCase() === "true";
  if (!strict) return true;
  if (!deviceId?.trim()) return false;

  try {
    const snap = await adminDb()
      .collection("user_devices")
      .where("uid", "==", uid)
      .limit(20)
      .get();

    const target = deviceId.trim().toLowerCase();
    return snap.docs.some((d) => {
      const row = d.data();
      const id = String(row.id ?? d.id ?? "").toLowerCase();
      const built = `${row.device}_${row.browser}`.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      return id === target || built === target;
    });
  } catch (err) {
    if (isFirestoreQuotaError(err)) return true;
    throw err;
  }
}

function sessionAddressesMatch(uid: string, sessionAddr: string, requestAddr: string): boolean {
  const canonical = derivedGarudaWalletAddress(uid).toLowerCase();
  const session = sessionAddr.toLowerCase();
  const request = requestAddr.toLowerCase();
  return session === request || session === canonical || request === canonical;
}

export async function issueGarudaSignSession(input: {
  uid: string;
  deviceId?: string;
  walletAddress: string;
}): Promise<{ signToken: string; expiresAt: number }> {
  const trusted = await verifyTrustedDevice(input.uid, input.deviceId);
  if (!trusted) {
    throw new Error("Perangkat tidak terdaftar, hubungkan dari perangkat tepercaya");
  }

  const signToken = randomBytes(24).toString("hex");
  const expiresAt = Date.now() + SIGN_TTL_MS;
  const walletAddress = derivedGarudaWalletAddress(input.uid);

  const payload: SignSessionRow = {
    uid: input.uid,
    walletAddress,
    deviceId: input.deviceId?.trim() || null,
    expiresAt,
  };

  memorySessions.set(signToken, payload);

  try {
    await adminDb().collection(SESSIONS_COL).doc(signToken).set({
      ...payload,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (!isFirestoreQuotaError(err)) {
      console.warn("[garuda/sign-session] Firestore write failed, using in-memory session", err);
    }
  }

  return { signToken, expiresAt };
}

export async function consumeGarudaSignSession(input: {
  uid: string;
  signToken: string;
  walletAddress: string;
}): Promise<void> {
  const requireChallenge = process.env.GARUDA_WALLET_SIGN_REQUIRE_CHALLENGE?.trim().toLowerCase() !== "false";
  if (!requireChallenge) return;

  const token = input.signToken?.trim();
  if (!token) throw new Error("Sign challenge required");

  let data: SignSessionRow | undefined = memorySessions.get(token);
  if (data) {
    memorySessions.delete(token);
  } else {
    const ref = adminDb().collection(SESSIONS_COL).doc(token);
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Sign challenge invalid or expired");
    data = snap.data() as SignSessionRow;
    await ref.delete().catch(() => null);
  }

  if (!data) throw new Error("Sign challenge invalid or expired");

  if (data.uid !== input.uid) throw new Error("Sign challenge mismatch");
  if (!sessionAddressesMatch(input.uid, data.walletAddress, input.walletAddress)) {
    throw new Error("Sign challenge wallet mismatch");
  }
  if (typeof data.expiresAt !== "number" || data.expiresAt < Date.now()) {
    throw new Error("Sign challenge expired");
  }
}
