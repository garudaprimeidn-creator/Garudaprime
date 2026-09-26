import {
  connectWalletConnect,
  getActiveWalletConnectProvider,
  getWalletConnectPeerName,
  isWalletConnectConfigured,
  syncWalletConnectPeerName,
} from "./walletConnectProvider";
import { SIDRA_CHAIN } from "./sidraNetwork";
import { secureSet, WALLET_KEY } from "../security/secureStorage";
import {
  getTrustProvider,
  isTrustWalletInjected,
  isMobileDevice,
  type TrustEthereumProvider,
} from "./trustWalletProvider";
import { walletConnectOptionsForApp } from "./walletAppRouting";
import {
  getGarudaNativeEthereumProvider,
  isGarudaNativeAddress,
  resolveGarudaNativeCanonicalAddress,
} from "./garudaWalletBridge";
import {
  getLocalPhraseEthereumProvider,
  resolvePhraseSignerForTransaction,
  isPhraseWalletAddress,
  PHRASE_WALLET_PROVIDER,
} from "./phraseWalletBridge";
import { auth as firebaseAuth } from "../firebase/config";
import { grantGarudaSignWindow } from "./garudaWalletSignGate";
import {
  ensureGarudaPrimeSignerForTransaction,
  ensureGarudaNativeSigningReady,
  fetchExistingGarudaWalletAddress,
} from "./garudaNativeProvision";
import { getCachedGarudaServerAddress, cacheGarudaServerAddress } from "./garudaNativeSession";
import type { ConnectedWalletDoc } from "../firebase/firestoreService";
import {
  formatWalletAddressShort,
  isGarudaPrimeSpendAddress,
  normalizeWalletAddress,
  resolveGarudaServerSignerAddress,
  resolveTransactionWalletProvider,
} from "./connectedWalletUtils";
import { loadPrimaryWalletLock, resolveAddressLockedProvider } from "./primaryWalletLock";
import {
  isGarudaNativeWalletType,
  isGarudaPremiumWalletType,
  isNativeWalletProvider,
  isPhraseWalletProvider,
  requiresEmbeddedTransactionSigner,
  type ConnectedWallet,
  type GarudaWalletType,
  type PhraseWalletProvider,
  type WalletProvider,
} from "./walletService";

export type WalletProviderKind = "metamask" | "walletconnect" | "trustwallet";

export const getMetaMaskInjected = (): TrustEthereumProvider | undefined => {
  const eth = typeof window !== "undefined" ? window.ethereum : undefined;
  if (!eth) return undefined;

  const isMetaMaskProvider = (p: TrustEthereumProvider) =>
    Boolean(p.isMetaMask && !p.isTrust);

  if (isMetaMaskProvider(eth)) return eth;

  if (Array.isArray(eth.providers)) {
    const mm = eth.providers.find(isMetaMaskProvider);
    if (mm) return mm;
  }

  return undefined;
};

/** Every injected / in-app provider on this device (MetaMask, Trust, browser). */
export const getAllInjectedProviders = (): TrustEthereumProvider[] => {
  if (typeof window === "undefined") return [];
  const seen = new Set<TrustEthereumProvider>();
  const list: TrustEthereumProvider[] = [];
  const add = (provider?: TrustEthereumProvider) => {
    if (!provider || seen.has(provider)) return;
    seen.add(provider);
    list.push(provider);
  };

  add(getMetaMaskInjected());
  add(getTrustProvider());
  const eth = window.ethereum;
  if (eth) {
    add(eth);
    eth.providers?.forEach(add);
  }
  return list;
};

/** Injected browser / in-app wallet, never WalletConnect. */
export const getInjectedEthereumProvider = (kind?: WalletProviderKind): TrustEthereumProvider | undefined => {
  if (kind === "metamask") return getMetaMaskInjected();
  if (kind === "trustwallet") return getTrustProvider();
  return getMetaMaskInjected() ?? getTrustProvider() ?? (typeof window !== "undefined" ? window.ethereum : undefined);
};

/**
 * Available signer: injected / in-app wallet first, then an active WalletConnect session.
 * Does not open new WalletConnect connections.
 */
export const getAvailableWalletProvider = (kind?: WalletProviderKind): TrustEthereumProvider | undefined => {
  const injected = getInjectedEthereumProvider(kind);
  if (injected) return injected;

  const wc = getActiveWalletConnectProvider();
  if (!wc) return undefined;

  if (kind === "metamask") {
    syncWalletConnectPeerName();
    return wc as unknown as TrustEthereumProvider;
  }
  if (kind === "trustwallet") {
    syncWalletConnectPeerName();
    const peer = getWalletConnectPeerName()?.toLowerCase() ?? "";
    if (!peer.includes("trust")) return undefined;
  }

  return wc as unknown as TrustEthereumProvider;
};

const accountMatches = async (eth: TrustEthereumProvider, from: string) => {
  try {
    const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
    const target = from.toLowerCase();
    return accounts.some((a) => a.toLowerCase() === target);
  } catch {
    return false;
  }
};

const rejectIfUserDenied = (e: unknown): void => {
  const msg = e instanceof Error ? e.message.toLowerCase() : "";
  if (msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel")) {
    throw Object.assign(e instanceof Error ? e : new Error("User rejected"), { code: "wallet/user-rejected" });
  }
};

export const activateProviderForAddress = async (
  eth: TrustEthereumProvider,
  from: string,
): Promise<TrustEthereumProvider | null> => {
  if (await accountMatches(eth, from)) return eth;
  try {
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    const target = from.toLowerCase();
    if (accounts.some((a) => a.toLowerCase() === target)) return eth;
  } catch (e) {
    rejectIfUserDenied(e);
  }
  return null;
};

const inferProviderKind = (eth: TrustEthereumProvider, fallback?: WalletProviderKind): WalletProviderKind => {
  if (eth.isTrust) return "trustwallet";
  if (eth.isMetaMask) return "metamask";
  if (fallback && fallback !== "walletconnect") return fallback;
  if (isTrustWalletInjected()) return "trustwallet";
  if (getMetaMaskInjected()) return "metamask";
  return fallback ?? "walletconnect";
};

const persistSession = (address: string, provider: WalletProviderKind | WalletProvider) => {
  const addrLock = resolveAddressLockedProvider(address);
  if (addrLock) {
    provider = addrLock;
  } else {
    const primaryLock = loadPrimaryWalletLock();
    if (primaryLock?.address.toLowerCase() === address.trim().toLowerCase()) {
      if (primaryLock.provider === "embedded:garuda" || isGarudaNativeWalletType(primaryLock.walletType)) {
        provider = "embedded:garuda";
      } else {
        provider = primaryLock.provider;
      }
    }
  }
  secureSet(WALLET_KEY, JSON.stringify({
    address,
    provider,
    chainId: SIDRA_CHAIN.chainId,
    network: SIDRA_CHAIN.name,
    connected: true,
  }));
};

const walletMismatchError = (expected: string, got: string) =>
  Object.assign(
    new Error(
      `Dompet yang terhubung (${formatWalletAddressShort(got)}) tidak cocok dengan alamat sumber (${formatWalletAddressShort(expected)}), pilih dompet utama di MetaMask`,
    ),
    { code: "send/wallet-mismatch" },
  );

const tryGarudaNativeSigner = async (from: string): Promise<TrustEthereumProvider | null> =>
  getGarudaNativeEthereumProvider(from);

const garudaNotReadyError = () =>
  Object.assign(
    new Error("Dompet Garuda Prime belum aktif. Buka aplikasi, tunggu beberapa detik, lalu coba lagi."),
    { code: "embedded/not-ready" },
  );

/** Dompet frasa BIP39, tanda tangan lokal di perangkat (tanpa MetaMask). */
export const shouldPreferPhraseTransactionSigner = (
  from: string,
  providerKind?: WalletProviderKind | GarudaWalletType | PhraseWalletProvider,
): boolean => {
  if (isPhraseWalletProvider(providerKind)) return true;

  const addrLock = resolveAddressLockedProvider(from);
  if (addrLock === PHRASE_WALLET_PROVIDER) return true;

  const primaryLock = loadPrimaryWalletLock();
  if (primaryLock?.address.toLowerCase() === from.trim().toLowerCase()) {
    if (primaryLock.provider === PHRASE_WALLET_PROVIDER) return true;
    if (primaryLock.walletType === PHRASE_WALLET_PROVIDER) return true;
  }

  return isPhraseWalletAddress(from);
};

/** Garuda native embedded, tanpa popup MetaMask. */
export const shouldPreferEmbeddedTransactionSigner = (
  from: string,
  providerKind?: WalletProviderKind | GarudaWalletType | PhraseWalletProvider,
): boolean => {
  if (providerKind === "embedded:garuda" || isGarudaNativeWalletType(providerKind)) return true;
  if (shouldPreferPhraseTransactionSigner(from, providerKind)) return false;
  if (isPhraseWalletProvider(providerKind)) return false;
  if (isNativeWalletProvider(providerKind)) return false;

  const fromKey = from.trim().toLowerCase();
  const server = resolveGarudaServerSignerAddress()?.toLowerCase();
  if (server && fromKey === server) return true;
  if (isGarudaNativeAddress(from)) return true;
  if (isGarudaPrimeSpendAddress(from)) return true;

  const addrLock = resolveAddressLockedProvider(from);
  if (addrLock === "embedded:garuda") return true;

  const primaryLock = loadPrimaryWalletLock();
  if (primaryLock?.provider === "embedded:garuda" || isGarudaNativeWalletType(primaryLock?.walletType)) {
    return true;
  }
  if (primaryLock?.address.toLowerCase() === fromKey) {
    if (primaryLock.provider === "embedded:garuda" || isGarudaNativeWalletType(primaryLock.walletType)) {
      return true;
    }
  }

  if (providerKind === "embedded:privy" || providerKind === "embedded:external") return true;
  if (isGarudaNativeWalletType(providerKind)) return true;

  if (isGarudaNativeAddress(from)) {
    const primaryLock = loadPrimaryWalletLock();
    if (primaryLock?.address.toLowerCase() === fromKey) {
      return primaryLock.provider === "embedded:garuda"
        || isGarudaNativeWalletType(primaryLock.walletType);
    }
    return addrLock === "embedded:garuda";
  }

  return requiresEmbeddedTransactionSigner(providerKind);
};

export const shouldPreferPrivyTransactionSigner = shouldPreferEmbeddedTransactionSigner;

const phraseNotReadyError = () =>
  Object.assign(
    new Error("Dompet frasa belum aktif. Masuk ulang dengan frasa sandi dan PIN."),
    { code: "phrase/not-ready" },
  );

const resolvePhraseSigner = async (from: string): Promise<TrustEthereumProvider> => {
  const eth = await getLocalPhraseEthereumProvider(from);
  if (!eth) throw phraseNotReadyError();
  persistSession(from, PHRASE_WALLET_PROVIDER);
  return eth;
};

const resolveEmbeddedSigner = async (
  from: string,
  providerKind?: WalletProviderKind | GarudaWalletType,
): Promise<TrustEthereumProvider> => {
  const uid = firebaseAuth.currentUser?.uid;
  if (!uid) throw garudaNotReadyError();

  grantGarudaSignWindow();
  const { getGarudaSignerProvider } = await import("./simpleTxSigner");
  return getGarudaSignerProvider(uid, from);
};

/**
 * Resolve an active signer for `from`:
 * - Dompet frasa BIP39 → penandatangan lokal (tanpa popup MetaMask)
 * - Garuda Prime OTP/server → Garuda Wallet Service (tanpa popup MetaMask)
 * - MetaMask / Trust / WalletConnect → injected atau sesi WC (popup dompet wajib)
 */
export type EnsureSignerOptions = {
  /** When false, only use injected wallets or an active WalletConnect session. */
  allowNewWalletConnect?: boolean;
};

/** Alamat + provider untuk kirim/bayar, delegasi ke simpleTxSigner. */
export async function resolveTransactionSignerContext(
  spendAddress: string,
  connectedWallet?: ConnectedWallet | null,
  _row?: ConnectedWalletDoc | null,
  uid?: string | null,
): Promise<{ address: string; provider: WalletProvider }> {
  const { resolveSimpleTxSigner } = await import("./simpleTxSigner");
  return resolveSimpleTxSigner({
    profileAddress: spendAddress,
    connectedWallet,
    fallbackAddress: spendAddress,
    uid,
  });
}

export const ensureSignerForAddress = async (
  from: string,
  providerKind?: WalletProviderKind | GarudaWalletType | PhraseWalletProvider,
  options?: EnsureSignerOptions,
): Promise<TrustEthereumProvider> => {
  const fromLower = from.trim().toLowerCase();

  const phraseSession = await resolvePhraseSignerForTransaction(from, providerKind as WalletProvider | undefined);
  if (phraseSession) {
    const phraseEth = await getLocalPhraseEthereumProvider(phraseSession);
    if (phraseEth) {
      persistSession(phraseSession, PHRASE_WALLET_PROVIDER);
      return phraseEth;
    }
  }

  const phraseEth = await getLocalPhraseEthereumProvider(from);
  if (phraseEth) {
    persistSession(from, PHRASE_WALLET_PROVIDER);
    return phraseEth;
  }

  if (shouldPreferPhraseTransactionSigner(from, providerKind)) {
    return resolvePhraseSigner(from);
  }
  if (
    isGarudaNativeWalletType(providerKind as WalletProvider)
    || shouldPreferEmbeddedTransactionSigner(from, providerKind)
  ) {
    return resolveEmbeddedSigner(from, providerKind);
  }

  const allowNewWalletConnect = options?.allowNewWalletConnect !== false
    && !isGarudaNativeWalletType(providerKind as WalletProvider)
    && !isGarudaPrimeSpendAddress(from);

  const tryActivate = async (
    eth: TrustEthereumProvider | undefined | null,
    sessionProvider?: WalletProviderKind,
  ): Promise<TrustEthereumProvider | null> => {
    if (!eth) return null;
    const activated = await activateProviderForAddress(eth, from);
    if (!activated) return null;
    persistSession(from, sessionProvider ?? inferProviderKind(activated, providerKind));
    return activated;
  };

  const wc = getActiveWalletConnectProvider();
  if (wc) {
    const wcActivated = await tryActivate(
      wc as unknown as TrustEthereumProvider,
      providerKind === "trustwallet" ? "trustwallet" : "walletconnect",
    );
    if (wcActivated) return wcActivated;
  }

  const connectViaWalletConnect = async (forceNew = false): Promise<TrustEthereumProvider> => {
    syncWalletConnectPeerName();
    const wcOptions = {
      ...walletConnectOptionsForApp(providerKind, getWalletConnectPeerName()),
      expectedAddress: from,
      forceNewSession: forceNew,
    };
    const appProvider = wcOptions.preferTrustWallet ? "trustwallet" : "metamask";

    const { provider, address } = await connectWalletConnect(wcOptions);
    if (address.toLowerCase() !== fromLower) {
      if (!forceNew && allowNewWalletConnect) {
        return connectViaWalletConnect(true);
      }
      throw walletMismatchError(from, address);
    }
    persistSession(from, appProvider);
    return provider as unknown as TrustEthereumProvider;
  };

  const injectedKinds: WalletProviderKind[] = providerKind === "walletconnect"
    ? ["metamask", "trustwallet"]
    : providerKind === "metamask" || providerKind === "trustwallet"
      ? [providerKind, providerKind === "metamask" ? "trustwallet" : "metamask"]
      : ["metamask", "trustwallet"];

  for (const kind of [...new Set(injectedKinds)]) {
    const eth = getInjectedEthereumProvider(kind);
    if (!eth) continue;
    if (await accountMatches(eth, from)) {
      persistSession(from, kind);
      return eth;
    }
  }

  for (const kind of [...new Set(injectedKinds)]) {
    const eth = getInjectedEthereumProvider(kind);
    if (!eth) continue;
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      if (accounts.some((a) => a.toLowerCase() === fromLower)) {
        persistSession(from, kind);
        return eth;
      }
    } catch (e) {
      rejectIfUserDenied(e);
    }
    const activated = await tryActivate(eth, kind);
    if (activated) return activated;
  }

  const genericInjected = typeof window !== "undefined" ? window.ethereum : undefined;
  if (genericInjected && await accountMatches(genericInjected, from)) {
    persistSession(from, inferProviderKind(genericInjected, providerKind));
    return genericInjected;
  }
  const genericActivated = await tryActivate(genericInjected, providerKind);
  if (genericActivated) return genericActivated;

  if (wc) {
    const wcActivated = await tryActivate(
      wc as unknown as TrustEthereumProvider,
      providerKind === "trustwallet" ? "trustwallet" : "walletconnect",
    );
    if (wcActivated) return wcActivated;
  }

  if (allowNewWalletConnect && isWalletConnectConfigured()) {
    return connectViaWalletConnect(false);
  }

  throw Object.assign(
    new Error("Buka dompet yang terpasang (MetaMask / Trust Wallet) lalu coba lagi"),
    { code: "send/no-wallet" },
  );
};

/** Resolve signer for message signing, injected first, then WalletConnect. */
export const resolveSigningProvider = async (
  address: string,
  providerKind?: WalletProviderKind | GarudaWalletType | PhraseWalletProvider,
): Promise<TrustEthereumProvider> => {
  if (shouldPreferPhraseTransactionSigner(address, providerKind)) {
    return resolvePhraseSigner(address);
  }
  if (shouldPreferEmbeddedTransactionSigner(address, providerKind)) {
    return resolveEmbeddedSigner(address, providerKind);
  }

  const injected = getInjectedEthereumProvider(
    providerKind === "metamask" || providerKind === "trustwallet" ? providerKind : undefined,
  );
  if (injected && await accountMatches(injected, address)) return injected;

  for (const kind of ["metamask", "trustwallet"] as WalletProviderKind[]) {
    if (kind === providerKind) continue;
    const eth = getInjectedEthereumProvider(kind);
    if (eth && await accountMatches(eth, address)) return eth;
  }

  const wc = getActiveWalletConnectProvider();
  if (wc?.accounts?.some((a) => a.toLowerCase() === address.toLowerCase())) {
    return wc as unknown as TrustEthereumProvider;
  }

  return ensureSignerForAddress(address, providerKind);
};
