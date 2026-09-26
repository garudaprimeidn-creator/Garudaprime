import { getAddress, isAddress } from "viem";
import { adminDb } from "./firebaseAdmin.js";

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/i;
const WALLET_SHORT_RE = /^0x[a-fA-F0-9]{2,8}(?:\.{3}|…)[a-fA-F0-9]{2,8}$/i;

export const isWalletLikeLabel = (value: string): boolean => {
  const n = value.trim();
  if (WALLET_RE.test(n)) return true;
  return WALLET_SHORT_RE.test(n);
};

const normalizeLookupAddress = (address: string): string | null => {
  const trimmed = address.trim();
  if (!trimmed) return null;
  if (!isAddress(trimmed, { strict: false })) return null;
  try {
    return getAddress(trimmed);
  } catch {
    return null;
  }
};

const pickDisplayName = (profile: FirebaseFirestore.DocumentData | undefined): string | null => {
  const fullName = String(profile?.fullName ?? "").trim();
  if (fullName && !isWalletLikeLabel(fullName)) return fullName;
  const email = String(profile?.email ?? "").trim();
  if (email.includes("@")) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }
  return null;
};

async function findUidByWalletAddress(
  db: FirebaseFirestore.Firestore,
  address: string,
): Promise<string | null> {
  const variants = new Set<string>([address.trim(), address.trim().toLowerCase()]);
  try {
    variants.add(getAddress(address.trim()));
  } catch {
    /* keep raw variants */
  }

  for (const variant of variants) {
    const linkedSnap = await db.collection("connected_wallets")
      .where("walletAddress", "==", variant)
      .limit(1)
      .get();

    if (!linkedSnap.empty) {
      const uid = String(linkedSnap.docs[0].data().uid ?? "").trim();
      if (uid) return uid;
    }

    const userSnap = await db.collection("users")
      .where("walletAddress", "==", variant)
      .limit(1)
      .get();
    if (!userSnap.empty) return userSnap.docs[0].id;
  }

  const garudaSnap = await db.collection("garuda_native_wallets")
    .where("walletAddress", "==", address.trim().toLowerCase())
    .limit(1)
    .get();
  if (!garudaSnap.empty) {
    const uid = String(garudaSnap.docs[0].data().uid ?? garudaSnap.docs[0].id ?? "").trim();
    if (uid) return uid;
  }

  return null;
}

export async function resolveUidFromWalletAddress(address: string): Promise<string | null> {
  const normalized = normalizeLookupAddress(address);
  if (!normalized) return null;

  const db = adminDb();
  const lower = normalized.toLowerCase();

  for (const variant of [normalized, lower]) {
    const uid = await findUidByWalletAddress(db, variant);
    if (uid) return uid;
  }

  return null;
}

export async function resolveWalletDisplayName(address: string): Promise<string | null> {
  const uid = await resolveUidFromWalletAddress(address);
  if (!uid) return null;

  const profileSnap = await adminDb().collection("users").doc(uid).get();
  return pickDisplayName(profileSnap.data());
}

export async function resolveWalletDisplayNames(
  addresses: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(
    addresses
      .map((addr) => normalizeLookupAddress(addr))
      .filter((addr): addr is string => Boolean(addr)),
  )];

  const out: Record<string, string> = {};
  await Promise.all(unique.map(async (addr) => {
    const name = await resolveWalletDisplayName(addr);
    if (name) out[addr.toLowerCase()] = name;
  }));
  return out;
}
