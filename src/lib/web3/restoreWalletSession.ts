import { getConnectedWalletDocs, type UserProfile } from "../firebase/firestoreService";
import {
  dedupeConnectedWalletDocs,
  resolveFirestoreWalletProvider,
  resolveLockedWalletProvider,
  resolvePrimaryWalletAddress,
  syncWalletProviderLocksFromFirestore,
} from "./connectedWalletUtils";
import {
  loadPrimaryWalletLock,
  primaryWalletLockForRow,
  savePrimaryWalletLock,
} from "./primaryWalletLock";
import {
  getStoredWallet,
  storeConnectedWalletSession,
  type ConnectedWallet,
  type WalletProvider,
} from "./walletService";
import { SIDRA_CHAIN } from "./sidraNetwork";

export function connectedWalletFromAddress(
  address: string,
  provider: WalletProvider = "walletconnect",
): ConnectedWallet {
  return {
    address,
    provider,
    chainId: SIDRA_CHAIN.chainId,
    network: SIDRA_CHAIN.name,
    connected: true,
  };
}

function lockedProviderForAddress(
  address: string,
  docs: ReturnType<typeof dedupeConnectedWalletDocs>,
): WalletProvider | null {
  const key = address.trim().toLowerCase();
  const lock = loadPrimaryWalletLock();
  if (lock?.address.toLowerCase() === key) {
    return lock.provider;
  }
  const match = docs.find((d) => d.walletAddress.toLowerCase() === key);
  if (!match) return null;
  return resolveFirestoreWalletProvider(match);
}

function persistPrimaryLock(
  address: string,
  docs: ReturnType<typeof dedupeConnectedWalletDocs>,
  provider: WalletProvider,
): void {
  const match = docs.find((d) => d.walletAddress.toLowerCase() === address.toLowerCase());
  if (match) {
    savePrimaryWalletLock(primaryWalletLockForRow(match, provider));
  }
}

/** Sesi dompet mengikuti Firestore + kunci lokal, tidak ditebak ulang dari sesi global. */
function reconcileWithFirestore(
  stored: ConnectedWallet,
  docs: ReturnType<typeof dedupeConnectedWalletDocs>,
): ConnectedWallet {
  const locked = lockedProviderForAddress(stored.address, docs);
  if (locked) {
    return { ...stored, provider: locked };
  }
  return stored;
}

/** Restore panel wallet session from Firestore linked wallets (kunci tipe per alamat). */
export async function restoreConnectedWalletSession(
  uid: string,
  profile: UserProfile | null,
): Promise<ConnectedWallet | null> {
  const docs = uid ? dedupeConnectedWalletDocs(await getConnectedWalletDocs(uid).catch(() => [])) : [];

  syncWalletProviderLocksFromFirestore(docs);

  const lock = loadPrimaryWalletLock();
  const lockKey = lock?.address?.trim().toLowerCase() ?? "";
  const profileKey = profile?.walletAddress?.trim().toLowerCase() ?? "";
  const stored = getStoredWallet();
  const storedKey = stored?.address?.trim().toLowerCase() ?? "";

  const docHas = (key: string) => docs.some((d) => d.walletAddress.toLowerCase() === key);

  let primaryAddr = "";
  if (lockKey && docHas(lockKey)) {
    primaryAddr = lockKey;
  } else if (profileKey && docHas(profileKey)) {
    primaryAddr = profileKey;
  } else if (storedKey && docHas(storedKey)) {
    primaryAddr = storedKey;
  } else {
    primaryAddr = resolvePrimaryWalletAddress(profile?.walletAddress ?? null);
  }

  if (primaryAddr && storedKey && storedKey !== primaryAddr) {
    const match = docs.find((d) => d.walletAddress.toLowerCase() === primaryAddr);
    const provider = match
      ? lockedProviderForAddress(match.walletAddress, docs) ?? resolveLockedWalletProvider(match)
      : (lock?.address.toLowerCase() === primaryAddr ? lock.provider : stored?.provider ?? "walletconnect");
    const wallet = connectedWalletFromAddress(
      match?.walletAddress ?? primaryAddr,
      provider,
    );
    storeConnectedWalletSession(wallet);
    persistPrimaryLock(wallet.address, docs, provider);
    return wallet;
  }

  if (stored?.address) {
    const reconciled = reconcileWithFirestore(stored, docs);
    if (reconciled.provider !== stored.provider || reconciled.address !== stored.address) {
      storeConnectedWalletSession(reconciled);
    }
    if (primaryAddr && reconciled.address.toLowerCase() === primaryAddr) {
      persistPrimaryLock(reconciled.address, docs, reconciled.provider);
    }
    return reconciled;
  }
  const match = primaryAddr
    ? docs.find((d) => d.walletAddress.toLowerCase() === primaryAddr.toLowerCase())
    : docs.find((d) => d.isPrimary) ?? docs[0];

  const address = primaryAddr || match?.walletAddress;
  if (!address?.startsWith("0x")) return null;

  const provider = match
    ? lockedProviderForAddress(match.walletAddress, docs) ?? resolveLockedWalletProvider(match)
    : "walletconnect";
  const wallet = connectedWalletFromAddress(address, provider);
  storeConnectedWalletSession(wallet);
  persistPrimaryLock(wallet.address, docs, provider);
  return wallet;
}
