import { auth as firebaseAuth } from "../firebase/config";
import {
  getConnectedWalletDocs,
  saveConnectedWallet,
  type ConnectedWalletDoc,
} from "../firebase/firestoreService";
import {
  isGarudaNativeAddress,
  linkGarudaNativeAlias,
  registerGarudaNativeWallet,
} from "./garudaWalletBridge";
import { signGarudaWalletRequest } from "./garudaWalletApi";
import { fetchGarudaWalletSecurity } from "./garudaWalletSecurityApi";
import { obtainGarudaSignToken, grantGarudaSignWindow } from "./garudaWalletSignGate";
import {
  cacheGarudaServerAddress,
  getCachedGarudaServerAddress,
} from "./garudaNativeSession";
import {
  dedupeConnectedWalletDocs,
  isGarudaPrimePersistedWalletType,
  normalizeWalletAddress,
  resolveStoredWalletProvider,
} from "./connectedWalletUtils";
import { isGarudaNativeWalletClientEnabled } from "./embeddedWalletConfig";
import { saveAddressProviderLock } from "./primaryWalletLock";
import { readRegistrationWallet } from "../auth/accountSetup";
import { ensurePhraseWalletReady, resolvePhraseSignerForTransaction } from "./phraseWalletBridge";
import { isPhraseWalletProvider } from "./walletService";

const activationStarted = new Map<string, Promise<string | null>>();

const garudaLinkedDocs = (docs: ConnectedWalletDoc[]) =>
  docs.filter((d) => resolveStoredWalletProvider(d) === "embedded:garuda");

/** Read-only, never creates a wallet. Uses Firestore links, then server security summary. */
export async function fetchExistingGarudaWalletAddress(uid: string): Promise<string | null> {
  if (!isGarudaNativeWalletClientEnabled()) return null;
  const fbUser = firebaseAuth.currentUser;
  if (!fbUser?.uid || fbUser.uid !== uid) return null;

  try {
    const summary = await fetchGarudaWalletSecurity();
    if (summary?.hasWallet && summary.address?.trim()) {
      return normalizeWalletAddress(summary.address);
    }
  } catch {
    /* fall through */
  }

  try {
    const allDocs = dedupeConnectedWalletDocs(await getConnectedWalletDocs(uid).catch(() => []));
    const garudaDocs = garudaLinkedDocs(allDocs);
    if (garudaDocs.length) {
      const primaryDoc = garudaDocs.find((d) => d.isPrimary) ?? garudaDocs[0];
      return normalizeWalletAddress(primaryDoc.walletAddress);
    }
  } catch {
    /* optional */
  }
  return null;
}

/** Semua alamat Garuda Premium yang dikenal, untuk daftar Dompet Terhubung. */
export async function collectGarudaWalletAddresses(uid?: string): Promise<string[]> {
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const trimmed = raw?.trim();
    if (!trimmed?.startsWith("0x")) return;
    try {
      seen.add(normalizeWalletAddress(trimmed).toLowerCase());
    } catch {
      seen.add(trimmed.toLowerCase());
    }
  };

  push(getCachedGarudaServerAddress());
  push(readRegistrationWallet());

  if (uid) {
    push(await fetchExistingGarudaWalletAddress(uid).catch(() => null));
    try {
      const docs = dedupeConnectedWalletDocs(await getConnectedWalletDocs(uid).catch(() => []));
      for (const doc of garudaLinkedDocs(docs)) {
        push(doc.walletAddress);
      }
    } catch {
      /* optional */
    }
  }

  try {
    const summary = await fetchGarudaWalletSecurity();
    if (summary?.hasWallet) push(summary.address);
  } catch {
    /* optional */
  }

  return [...seen].map((key) => {
    try {
      return normalizeWalletAddress(key);
    } catch {
      return key;
    }
  });
}

/** Upsert Garuda native row to the authoritative server address, does not override user's primary wallet choice. */
export async function syncGarudaPrimeWalletIdentity(
  uid: string,
  serverAddr: string,
  previousAddress?: string | null,
  options?: { makePrimary?: boolean },
): Promise<boolean> {
  const server = normalizeWalletAddress(serverAddr);
  const prevKey = previousAddress?.trim().toLowerCase();
  if (prevKey && prevKey === server.toLowerCase()) return false;

  try {
    await saveConnectedWallet(
      uid,
      { address: server, provider: "embedded:garuda", network: "SDA Sidra Network" },
      { makePrimary: options?.makePrimary ?? false },
    );
    saveAddressProviderLock(server, "embedded:garuda", "embedded:garuda", { force: true });
    return true;
  } catch (err) {
    console.warn("[GarudaPrime] sync wallet identity failed", err);
    return false;
  }
}

const registerSigner = (canonicalAddr: string, uid: string): void => {
  const canonical = normalizeWalletAddress(canonicalAddr);
  if (isGarudaNativeAddress(canonical)) return;
  const fbUser = firebaseAuth.currentUser;
  if (!fbUser) return;

  registerGarudaNativeWallet(canonical, async (input) => {
    const freshToken = await fbUser.getIdToken();
    const signingAddr = getCachedGarudaServerAddress() || canonical;
    grantGarudaSignWindow();
    const signToken = await obtainGarudaSignToken(freshToken, signingAddr, uid);
    const activeAddr = getCachedGarudaServerAddress() || canonical;
    return signGarudaWalletRequest(freshToken, { ...input, address: activeAddr, signToken });
  });
};

/**
 * Find Garuda Prime native address for this account.
 * Firestore linked wallets → profile match → server-native (authoritative per uid).
 */
export async function resolveUserGarudaPrimeAddress(
  uid: string,
  profileAddress?: string | null,
): Promise<string | null> {
  const serverAddr = await fetchExistingGarudaWalletAddress(uid);
  if (serverAddr) return serverAddr;

  const allDocs = dedupeConnectedWalletDocs(await getConnectedWalletDocs(uid).catch(() => []));
  const garudaDocs = garudaLinkedDocs(allDocs);
  const profileKey = profileAddress?.trim().toLowerCase();

  if (!garudaDocs.length) {
    return null;
  }

  if (profileKey) {
    const profileMatch = garudaDocs.find((d) => d.walletAddress.toLowerCase() === profileKey);
    if (profileMatch) {
      return normalizeWalletAddress(profileMatch.walletAddress);
    }
  }
  const primaryDoc = garudaDocs.find((d) => d.isPrimary);
  return normalizeWalletAddress((primaryDoc ?? garudaDocs[0]).walletAddress);
}

/**
 * Register Garuda native EIP-1193 signer in-memory so send/approve flows work immediately.
 * Safe to call multiple times (idempotent).
 */
export async function ensureGarudaNativeSigningReady(
  uid: string,
  expectedAddress?: string | null,
): Promise<string> {
  if (!isGarudaNativeWalletClientEnabled()) {
    throw Object.assign(new Error("Garuda native wallet disabled"), { code: "embedded/not-ready" });
  }

  const fbUser = firebaseAuth.currentUser;
  if (!fbUser?.uid || fbUser.uid !== uid) {
    throw Object.assign(new Error("Login diperlukan untuk Garuda Wallet"), { code: "embedded/auth-required" });
  }

  const serverAddr = await fetchExistingGarudaWalletAddress(uid);
  if (!serverAddr) {
    throw Object.assign(
      new Error("Buat atau hubungkan dompet Garuda Prime terlebih dahulu"),
      { code: "embedded/not-ready" },
    );
  }

  const serverKey = serverAddr.toLowerCase();
  if (expectedAddress) {
    const expectedKey = normalizeWalletAddress(expectedAddress).toLowerCase();
    if (expectedKey && expectedKey !== serverKey) {
      console.warn("[GarudaPrime] profile address differs from server wallet; using server signer", {
        expected: expectedKey,
        server: serverKey,
      });
    }
  }

  const active = normalizeWalletAddress(serverAddr);
  registerSigner(active, uid);
  if (expectedAddress) {
    try {
      const expected = normalizeWalletAddress(expectedAddress);
      if (expected.toLowerCase() !== active.toLowerCase()) {
        linkGarudaNativeAlias(expected, active);
        void syncGarudaPrimeWalletIdentity(uid, active, expected, { makePrimary: false });
      }
    } catch {
      /* keep profile primary when address differs from server signer */
    }
  }
  const cached = getCachedGarudaServerAddress()?.trim().toLowerCase();
  if (!cached || cached === active.toLowerCase()) {
    cacheGarudaServerAddress(active);
  }
  return active;
}

export const isGarudaNativeSigningReady = (address?: string | null): boolean => {
  const candidate = address?.trim() || getCachedGarudaServerAddress() || "";
  if (!candidate) return false;
  return isGarudaNativeAddress(candidate);
};

/**
 * Auto-activate Garuda Prime for users who already linked/created the wallet:
 * 1) EIP-1193 signer ready for send/swap/approve
 * 2) Pay Hub gas + GAT allowance (background)
 */
export async function autoActivateGarudaPrimeWallet(
  uid: string,
  options?: { profileAddress?: string | null; includePayHub?: boolean },
): Promise<string | null> {
  if (!isGarudaNativeWalletClientEnabled()) return null;
  if (!firebaseAuth.currentUser?.uid || firebaseAuth.currentUser.uid !== uid) return null;

  const garudaAddr = await resolveUserGarudaPrimeAddress(uid, options?.profileAddress);
  if (!garudaAddr) return null;

  const key = `${uid}:${garudaAddr.toLowerCase()}`;
  if (isGarudaNativeSigningReady(garudaAddr)) {
    return garudaAddr;
  }

  const inflight = activationStarted.get(key);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      const active = await ensureGarudaNativeSigningReady(uid, garudaAddr);
      if (options?.includePayHub !== false) {
        void activatePayHubWallet(active, "embedded:garuda").catch(() => null);
      }
      return active;
    } catch (err) {
      console.warn("[GarudaPrime] auto-activate failed", err);
      return null;
    } finally {
      activationStarted.delete(key);
    }
  })();

  activationStarted.set(key, task);
  return task;
}

/** Blocking activation for send/approve, retries until signer is in memory. */
export async function ensureGarudaPrimeSignerForTransaction(
  uid: string,
  fromAddress: string,
): Promise<string> {
  const fromKey = fromAddress.trim().toLowerCase();

  const docs = dedupeConnectedWalletDocs(await getConnectedWalletDocs(uid).catch(() => []));
  const match = docs.find((d) => d.walletAddress.toLowerCase() === fromKey);
  const rowProvider = match ? resolveStoredWalletProvider(match) : null;

  const phraseAddr = await resolvePhraseSignerForTransaction(fromAddress, rowProvider);
  if (phraseAddr) return normalizeWalletAddress(phraseAddr);

  if (match && isPhraseWalletProvider(rowProvider)) {
    const ready = await ensurePhraseWalletReady(fromAddress);
    if (ready) return normalizeWalletAddress(ready);
    throw Object.assign(
      new Error("Dompet frasa belum aktif. Masuk ulang dengan frasa sandi dan PIN."),
      { code: "phrase/not-ready" },
    );
  }

  const isGarudaRow = Boolean(match && resolveStoredWalletProvider(match) === "embedded:garuda");

  let serverAddr = getCachedGarudaServerAddress();
  if (!serverAddr) {
    serverAddr = await fetchExistingGarudaWalletAddress(uid).catch(() => null);
    if (serverAddr) cacheGarudaServerAddress(serverAddr);
  }
  const serverKey = serverAddr?.trim().toLowerCase();
  const isServerGaruda = Boolean(serverKey && fromKey === serverKey);
  const isPersistedGaruda = Boolean(match && isGarudaPrimePersistedWalletType(match.walletType));

  if (!isGarudaRow && !isServerGaruda && !isPersistedGaruda && !serverKey) {
    throw Object.assign(
      new Error(`Alamat ini bukan dompet Garuda Prime, gunakan MetaMask/Trust untuk menandatangani`),
      { code: "embedded/not-garuda-wallet" },
    );
  }

  await autoActivateGarudaPrimeWallet(uid, { includePayHub: false });

  const server = getCachedGarudaServerAddress();
  if (server && isGarudaNativeAddress(server)) return normalizeWalletAddress(server);

  const active = await ensureGarudaNativeSigningReady(uid, fromAddress);
  if (isGarudaNativeAddress(active)) return active;

  throw Object.assign(
    new Error(`Dompet Garuda Prime belum aktif untuk ${fromKey.slice(0, 10)}…`),
    { code: "embedded/not-ready" },
  );
}
