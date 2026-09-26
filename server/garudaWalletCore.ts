/**
 * Garuda Prime Native Embedded Wallet, server-side wallet service.
 * Keys derived server-side only; never exposed to client.
 */
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { Hex } from "viem";
import { adminDb } from "./firebaseAdmin.js";
import { resolveGarudaWalletMasterSecretSync } from "./garudaWalletKms.js";
import { isFirestoreQuotaError } from "./firestoreQuota.js";

export const GARUDA_NATIVE_WALLETS_COL = "garuda_native_wallets";
export const GARUDA_WALLET_SIGN_LOGS_COL = "garuda_wallet_sign_logs";
export const GARUDA_NATIVE_PROVIDER = "embedded:garuda";
export const PHRASE_WALLET_PROVIDER = "embedded:phrase";

export type GarudaWalletStatus = "active" | "frozen" | "recovering";

export type GarudaNativeWalletRecord = {
  uid: string;
  walletAddress: string;
  publicKey: string;
  status: GarudaWalletStatus;
  network: string;
  chainId: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastSignedAt?: unknown;
};

export function isGarudaNativeWalletEnabled(): boolean {
  const raw = (
    process.env.GARUDA_WALLET_ENABLED
    || process.env.VITE_GARUDA_NATIVE_WALLET_ENABLED
  )?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export function isGarudaWalletAutoOnKyc(): boolean {
  const raw = process.env.GARUDA_WALLET_AUTO_ON_KYC?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

function masterSecret(): string {
  return resolveGarudaWalletMasterSecretSync();
}

export function isKycVerifiedForGarudaWallet(status: unknown, tier: unknown): boolean {
  const normalized = String(status ?? "none").toLowerCase();
  return Number(tier ?? 0) >= 3 && (normalized === "verified" || normalized === "approved");
}

export async function assertUserKycEligibleForGarudaWallet(uid: string): Promise<void> {
  if (!isGarudaWalletAutoOnKyc()) return;
  const snap = await adminDb().collection("users").doc(uid).get();
  const data = snap.data();
  if (!isKycVerifiedForGarudaWallet(data?.kycStatus, data?.kycTier)) {
    throw new Error("KYC verification required before Garuda wallet provisioning");
  }
}

function normalizeAddress(address: string): string {
  const v = address.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(v)) {
    throw new Error("Invalid wallet address");
  }
  return v;
}

/** Deterministic per-uid account. Production: replace with KMS/HSM HD derivation. */
export function deriveGarudaAccountForUid(uid: string): PrivateKeyAccount {
  const digest = createHash("sha256")
    .update(`garuda-native-wallet:v1:${masterSecret()}:${uid}`)
    .digest("hex");
  const privateKey = `0x${digest}` as Hex;
  return privateKeyToAccount(privateKey);
}

export function getGarudaWalletPublicConfig() {
  const enabled = isGarudaNativeWalletEnabled();
  return {
    enabled,
    vendor: "garuda" as const,
    providerType: GARUDA_NATIVE_PROVIDER,
    chainId: Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453,
    network: "SDA Sidra Network",
    autoOnKyc: isGarudaWalletAutoOnKyc(),
    signingMode: enabled ? "server-relayer" : "disabled",
  };
}

export async function getGarudaWalletByUid(uid: string): Promise<GarudaNativeWalletRecord | null> {
  const snap = await adminDb()
    .collection(GARUDA_NATIVE_WALLETS_COL)
    .where("uid", "==", uid)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { ...(doc.data() as GarudaNativeWalletRecord), uid };
}

/** Garuda Premium yang sudah dihubungkan eksplisit (frasa / OTP), bukan alamat deterministik uid. */
export async function getLinkedGarudaWalletAddress(uid: string): Promise<string | null> {
  try {
    const snap = await adminDb()
      .collection("connected_wallets")
      .where("uid", "==", uid)
      .limit(20)
      .get();
    for (const doc of snap.docs) {
      const row = doc.data();
      const wtype = String(row.walletType ?? row.provider ?? "").toLowerCase();
      if (!wtype.includes("garuda") && wtype !== "embedded") continue;
      const addr = String(row.walletAddress ?? "").trim();
      if (addr.startsWith("0x")) return normalizeAddress(addr).toLowerCase();
    }
  } catch (err) {
    if (!isFirestoreQuotaError(err)) throw err;
  }
  return null;
}

export function derivedGarudaWalletAddress(uid: string): string {
  return deriveGarudaAccountForUid(uid).address.toLowerCase();
}

function normalizeAddressLower(address: string): string {
  return address.trim().toLowerCase();
}

async function findConnectedWalletRow(
  uid: string,
  addressHint: string,
): Promise<Record<string, unknown> | null> {
  const hint = normalizeAddressLower(addressHint);
  if (!hint.startsWith("0x")) return null;
  try {
    const linked = await adminDb()
      .collection("connected_wallets")
      .where("uid", "==", uid)
      .get();
    for (const doc of linked.docs) {
      const addr = String(doc.data().walletAddress ?? "").trim().toLowerCase();
      if (addr === hint) return doc.data();
    }
  } catch (err) {
    if (isFirestoreQuotaError(err)) return null;
    throw err;
  }
  return null;
}

/** Semua alamat dompet milik uid, untuk cek saldo on-chain (case-insensitive). */
export async function listUserWalletAddresses(uid: string): Promise<string[]> {
  const out = new Set<string>();
  try {
    const profile = await adminDb().collection("users").doc(uid).get();
    const profileAddr = String(profile.data()?.walletAddress ?? "").trim();
    if (profileAddr.startsWith("0x")) out.add(normalizeAddressLower(profileAddr));

    const linked = await adminDb()
      .collection("connected_wallets")
      .where("uid", "==", uid)
      .get();
    for (const doc of linked.docs) {
      const addr = String(doc.data().walletAddress ?? "").trim();
      if (addr.startsWith("0x")) out.add(normalizeAddressLower(addr));
    }

    const garuda = await getGarudaWalletByUid(uid);
    if (garuda?.walletAddress) out.add(normalizeAddressLower(garuda.walletAddress));

    if (isGarudaNativeWalletEnabled()) {
      out.add(derivedGarudaWalletAddress(uid));
    }
  } catch (err) {
    if (!isFirestoreQuotaError(err)) throw err;
  }
  return [...out];
}

/** True when address belongs to uid via connected_wallets or users.profile walletAddress. */
export async function isUserConnectedWalletAddress(uid: string, address: string): Promise<boolean> {
  const hint = normalizeAddressLower(address);
  if (!hint.startsWith("0x")) return false;
  try {
    if (await findConnectedWalletRow(uid, hint)) return true;

    const profile = await adminDb().collection("users").doc(uid).get();
    const profileAddr = String(profile.data()?.walletAddress ?? "").trim().toLowerCase();
    return profileAddr === hint;
  } catch (err) {
    if (isFirestoreQuotaError(err)) return false;
    throw err;
  }
}

function walletRowIsPhrase(row: Record<string, unknown>): boolean {
  const wtype = String(row.walletType ?? row.provider ?? "").toLowerCase();
  return wtype.includes("phrase") || wtype === PHRASE_WALLET_PROVIDER;
}

/** Dompet BIP39+PIN, saldo & approval on-chain di alamat frasa, bukan derived Garuda uid. */
export async function isUserPhraseWalletAddress(uid: string, address: string): Promise<boolean> {
  const hint = normalizeAddressLower(address);
  if (!hint.startsWith("0x")) return false;
  try {
    const row = await findConnectedWalletRow(uid, hint);
    if (row && walletRowIsPhrase(row)) return true;

    const profile = await adminDb().collection("users").doc(uid).get();
    const data = profile.data();
    const profileAddr = String(data?.walletAddress ?? "").trim().toLowerCase();
    const authMethod = String(data?.authMethod ?? data?.loginProvider ?? "").toLowerCase();
    return profileAddr === hint && authMethod.includes("phrase");
  } catch (err) {
    if (isFirestoreQuotaError(err)) return false;
    throw err;
  }
}

/** Resolve any linked Garuda alias to the authoritative Sidra signer address. */
export async function resolveCanonicalGarudaWalletAddress(
  uid: string,
  addressHint?: string | null,
): Promise<string | null> {
  const hint = addressHint?.trim().toLowerCase();

  if (hint?.startsWith("0x")) {
    if (await isUserPhraseWalletAddress(uid, hint)) return hint;
  }

  if (!isGarudaNativeWalletEnabled()) {
    return hint?.startsWith("0x") ? hint : null;
  }

  if (hint?.startsWith("0x")) {
    try {
      if (await isUserGarudaLinkedAddress(uid, hint)) {
        await assertGarudaWalletOwner(uid, hint);
        return derivedGarudaWalletAddress(uid);
      }
    } catch {
      /* not a Garuda-owned hint */
    }
  }
  const record = await resolveGarudaWalletRecord(uid, hint);
  if (record) return derivedGarudaWalletAddress(uid);
  return hint?.startsWith("0x") ? hint : null;
}

/** Firestore record when available; otherwise deterministic Garuda wallet for on-chain pay. */
/** True when address is linked as embedded Garuda in connected_wallets. */
export async function isUserGarudaLinkedAddress(uid: string, address: string): Promise<boolean> {
  const hint = normalizeAddressLower(address);
  if (!hint.startsWith("0x")) return false;
  try {
    const row = await findConnectedWalletRow(uid, hint);
    if (!row) return false;
    const wtype = String(row.walletType ?? row.provider ?? "").toLowerCase();
    return wtype.includes("garuda") || wtype === "embedded:garuda";
  } catch (err) {
    if (isFirestoreQuotaError(err)) return false;
    throw err;
  }
}

export async function resolveGarudaWalletRecord(
  uid: string,
  addressHint?: string,
): Promise<GarudaNativeWalletRecord | null> {
  if (!isGarudaNativeWalletEnabled()) return null;

  let record: GarudaNativeWalletRecord | null = null;
  try {
    record = await getGarudaWalletByUid(uid);
  } catch (err) {
    if (!isFirestoreQuotaError(err)) throw err;
  }
  if (record) return record;

  const hint = addressHint?.trim().toLowerCase();
  const chainId = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;
  const network = "SDA Sidra Network";

  if (hint?.startsWith("0x")) {
    const linked = await isUserGarudaLinkedAddress(uid, hint);
    if (!linked) return null;
    return {
      uid,
      walletAddress: hint,
      publicKey: "",
      status: "active",
      network,
      chainId,
    };
  }

  const linkedAddr = await getLinkedGarudaWalletAddress(uid);
  if (linkedAddr) {
    return {
      uid,
      walletAddress: linkedAddr,
      publicKey: "",
      status: "active",
      network,
      chainId,
    };
  }

  return null;
}

export async function getGarudaWalletByAddress(address: string): Promise<GarudaNativeWalletRecord | null> {
  const key = normalizeAddress(address).toLowerCase();
  const snap = await adminDb()
    .collection(GARUDA_NATIVE_WALLETS_COL)
    .where("walletAddress", "==", key)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { ...(doc.data() as GarudaNativeWalletRecord) };
}

export type EnsureGarudaWalletOptions = {
  /** Skip KYC gate when user verified email OTP for wallet creation (registration flow). */
  skipKycCheck?: boolean;
};

/** Idempotent, returns existing or creates new Garuda native wallet. */
export async function ensureGarudaWalletForUser(
  uid: string,
  options?: EnsureGarudaWalletOptions,
): Promise<GarudaNativeWalletRecord> {
  if (!isGarudaNativeWalletEnabled()) {
    throw new Error("Garuda native wallet not enabled");
  }
  const existing = await getGarudaWalletByUid(uid);
  if (existing) {
    if (existing.status === "frozen") {
      throw new Error("Garuda wallet is frozen");
    }
    return existing;
  }

  if (!options?.skipKycCheck) {
    await assertUserKycEligibleForGarudaWallet(uid);
  }

  const account = deriveGarudaAccountForUid(uid);
  const walletAddress = account.address.toLowerCase();
  const chainId = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;

  const ref = adminDb().collection(GARUDA_NATIVE_WALLETS_COL).doc();
  const record: GarudaNativeWalletRecord = {
    uid,
    walletAddress,
    publicKey: account.publicKey,
    status: "active",
    network: "SDA Sidra Network",
    chainId,
  };

  await ref.set({
    ...record,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return record;
}

export async function assertGarudaWalletOwner(uid: string, address: string): Promise<GarudaNativeWalletRecord> {
  const hint = normalizeAddress(address).toLowerCase();
  const derived = derivedGarudaWalletAddress(uid);
  const account = deriveGarudaAccountForUid(uid);

  const record = await resolveGarudaWalletRecord(uid, address);

  const allowed = new Set<string>([derived]);
  if (record?.walletAddress) allowed.add(record.walletAddress.toLowerCase());

  if (hint && !allowed.has(hint)) {
    if (await isUserGarudaLinkedAddress(uid, hint)) {
      allowed.add(hint);
    } else {
      try {
        const linked = await adminDb()
          .collection("connected_wallets")
          .where("uid", "==", uid)
          .where("walletAddress", "==", hint)
          .limit(1)
          .get();
        if (!linked.empty) allowed.add(hint);
      } catch (err) {
        if (!isFirestoreQuotaError(err)) throw err;
      }

      if (!allowed.has(hint)) {
        const byAddr = await getGarudaWalletByAddress(hint).catch(() => null);
        if (byAddr?.uid === uid) allowed.add(hint);
      }
    }
  }

  if (hint && hint !== derived && !allowed.has(hint)) {
    throw new Error("Wallet address does not belong to user");
  }

  if (record?.status === "frozen") {
    throw new Error("Garuda wallet is frozen");
  }

  return {
    uid,
    walletAddress: derived,
    publicKey: account.publicKey,
    status: record?.status ?? "active",
    network: record?.network ?? "SDA Sidra Network",
    chainId: record?.chainId ?? (Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453),
  };
}

export async function freezeGarudaWallet(uid: string, reason?: string): Promise<void> {
  const record = await getGarudaWalletByUid(uid);
  if (!record) throw new Error("Garuda wallet not found");
  const snap = await adminDb()
    .collection(GARUDA_NATIVE_WALLETS_COL)
    .where("uid", "==", uid)
    .limit(1)
    .get();
  if (snap.empty) return;
  await snap.docs[0].ref.update({
    status: "frozen",
    frozenAt: FieldValue.serverTimestamp(),
    frozenReason: reason?.trim() || "user_request",
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function unfreezeGarudaWallet(uid: string): Promise<void> {
  const snap = await adminDb()
    .collection(GARUDA_NATIVE_WALLETS_COL)
    .where("uid", "==", uid)
    .limit(1)
    .get();
  if (snap.empty) throw new Error("Garuda wallet not found");
  await snap.docs[0].ref.update({
    status: "active",
    frozenAt: null,
    frozenReason: null,
    recoveryRequestedAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function requestGarudaWalletRecovery(uid: string, note?: string): Promise<void> {
  const snap = await adminDb()
    .collection(GARUDA_NATIVE_WALLETS_COL)
    .where("uid", "==", uid)
    .limit(1)
    .get();
  if (snap.empty) throw new Error("Garuda wallet not found");
  await snap.docs[0].ref.update({
    status: "recovering",
    recoveryRequestedAt: FieldValue.serverTimestamp(),
    recoveryNote: note?.trim() || null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function getGarudaWalletSecuritySummary(uid: string) {
  const record = await getGarudaWalletByUid(uid);
  const linkedAddr = record ? null : await getLinkedGarudaWalletAddress(uid);

  if (!record && !linkedAddr) {
    return {
      hasWallet: false,
      enabled: isGarudaNativeWalletEnabled(),
      autoOnKyc: isGarudaWalletAutoOnKyc(),
    };
  }

  const address = record?.walletAddress ?? linkedAddr ?? "";
  const snap = record
    ? await adminDb()
      .collection(GARUDA_NATIVE_WALLETS_COL)
      .where("uid", "==", uid)
      .limit(1)
      .get()
    : null;
  const row = snap?.docs[0]?.data() ?? {};
  return {
    hasWallet: true,
    enabled: isGarudaNativeWalletEnabled(),
    autoOnKyc: isGarudaWalletAutoOnKyc(),
    address,
    status: record?.status ?? "active",
    network: record?.network ?? "SDA Sidra Network",
    chainId: record?.chainId ?? (Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453),
    lastSignedAt: row.lastSignedAt ?? null,
    frozenAt: row.frozenAt ?? null,
    recoveryRequestedAt: row.recoveryRequestedAt ?? null,
    signingMode: getGarudaWalletPublicConfig().signingMode,
  };
}

export async function logGarudaSignEvent(input: {
  uid: string;
  walletAddress: string;
  method: string;
  txHash?: string;
  status: "ok" | "rejected" | "error";
  error?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await adminDb().collection(GARUDA_WALLET_SIGN_LOGS_COL).add({
    ...input,
    createdAt: FieldValue.serverTimestamp(),
  });
}
