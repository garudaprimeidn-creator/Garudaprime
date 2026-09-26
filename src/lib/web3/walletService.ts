import { verifyMessage } from "viem";
import { isDemoAuthAllowed } from "../env/production";
import { fetchWalletAuthNonce, isWalletAuthApiConfigured } from "../firebase/walletAuthApi";
import { APP_ORIGIN } from "../app/branding";
import { SIDRA_CHAIN } from "./sidraNetwork";
import { ensureSidraNetwork } from "./ensureSidraNetwork";
import { secureSet, secureGet, secureRemove, WALLET_KEY } from "../security/secureStorage";
import {
  connectWalletConnect,
  disconnectWalletConnect,
  getActiveWalletConnectProvider,
  getWalletConnectPeerName,
  isWalletConnectConfigured,
  syncWalletConnectPeerName,
} from "./walletConnectProvider";
import { resolveWalletAppProvider } from "./walletAppRouting";
import {
  getInjectedEthereumProvider,
  getMetaMaskInjected,
  resolveSigningProvider,
} from "./walletProviderResolution";
import {
  getTrustProvider,
  isMobileDevice,
  isTrustWalletInjected,
  openTrustWalletMobile,
  TrustWalletError,
  type TrustEthereumProvider,
} from "./trustWalletProvider";
import { loadPrimaryWalletLock, resolveAddressLockedProvider } from "./primaryWalletLock";

export type GarudaWalletType = "embedded:garuda" | "embedded:privy" | "embedded:external";
export type PhraseWalletProvider = "embedded:phrase";
export type WalletProvider = "metamask" | "walletconnect" | "trustwallet" | GarudaWalletType | PhraseWalletProvider;

export const isPhraseWalletProvider = (p?: string | null): p is PhraseWalletProvider =>
  p === "embedded:phrase";

export const isGarudaPremiumWalletType = (p?: string | null): p is GarudaWalletType =>
  p === "embedded:garuda" || p === "embedded:privy" || p === "embedded:external";

export const isGarudaNativeWalletType = (p?: string | null): boolean =>
  p === "embedded:garuda";

/** MetaMask / Trust / WalletConnect, harus popup aplikasi dompet asli. */
export const isNativeWalletProvider = (p?: string | null): p is "metamask" | "trustwallet" | "walletconnect" =>
  p === "metamask" || p === "trustwallet" || p === "walletconnect";

/** Legacy Privy embedded, tanda tangan via Privy panel. */
export const requiresPrivyTransactionSigner = (p?: string | null): boolean =>
  p === "embedded:privy" || p === "embedded:external";

/** Garuda native + legacy embedded, tanpa popup MetaMask. */
export const requiresEmbeddedTransactionSigner = (p?: string | null): boolean =>
  isGarudaNativeWalletType(p) || requiresPrivyTransactionSigner(p);

export type ConnectWalletOptions = {
  /** Skip network switch during connect (faster). Sidra/Garuda added later when needed. */
  skipNetworkSwitch?: boolean;
  /** Fresh WalletConnect QR / pairing when linking an additional wallet. */
  forceNewWalletConnectSession?: boolean;
};

export type ConnectOption = WalletProvider | "kycport";

export type ConnectedWallet = {
  address: string;
  provider: WalletProvider;
  chainId: number;
  network: string;
  connected: boolean;
};

export type WalletAuthStep = "idle" | "connecting" | "signing" | "verifying" | "linking" | "success";

const generateDemoAddress = () =>
  `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;

const providerLabels: Record<ConnectOption, string> = {
  metamask: "MetaMask",
  walletconnect: "WalletConnect",
  trustwallet: "Trust Wallet",
  kycport: "Connect KYCPort",
};

export const getProviderLabel = (p: ConnectOption) => providerLabels[p];

const WALLET_TYPE_LABELS: Record<string, string> = {
  "embedded:garuda": "Garuda Prime",
  "embedded:phrase": "Dompet Frasa",
  "embedded:privy": "Garuda Prime",
  "embedded:external": "MetaMask (Eksternal)",
  "embedded:dynamic": "Garuda Prime",
  "embedded:web3auth": "Garuda Prime",
  embedded: "Garuda Prime",
};

/** Label for Firestore `walletType` (includes embedded vendors). */
export const getWalletTypeLabel = (walletType: string | undefined | null): string => {
  const raw = walletType?.trim();
  if (!raw) return "";
  if (WALLET_TYPE_LABELS[raw]) return WALLET_TYPE_LABELS[raw];
  if (raw in providerLabels) return providerLabels[raw as ConnectOption];
  return raw;
};

export const isTrustWalletAvailable = () =>
  isTrustWalletInjected() || isWalletConnectConfigured() || isMobileDevice();

/** Pick best available wallet, injected / in-app first, WalletConnect fallback. */
export const resolvePreferredWalletProvider = (): WalletProvider => {
  if (getMetaMaskInjected()) return "metamask";
  if (isTrustWalletInjected()) return "trustwallet";
  if (getActiveWalletConnectProvider()?.accounts?.length) return "walletconnect";
  if (isWalletConnectConfigured()) return "walletconnect";
  return "metamask";
};

/** Dompet aktif untuk transaksi panel Kirim / Tukar / Deposit. */
export const resolvePanelWalletProvider = (
  connectedProvider?: WalletProvider | string | null,
  sessionProvider?: WalletProvider,
): WalletProvider => {
  const raw = connectedProvider ?? sessionProvider ?? resolvePreferredWalletProvider();
  if (isGarudaPremiumWalletType(raw)) return raw;
  if (raw === "metamask" || raw === "trustwallet") return raw;
  syncWalletConnectPeerName();
  return resolveWalletAppProvider(raw, getWalletConnectPeerName());
};

export const resolveWalletAuthOrigin = (): string => {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return APP_ORIGIN.replace(/\/$/, "");
};

export const buildWalletAuthMessage = (input: {
  address: string;
  nonce: string;
  issuedAt: string;
  origin?: string;
}) => {
  const origin = input.origin?.replace(/\/$/, "") || resolveWalletAuthOrigin();
  return [
    "Garuda Prime Authentication",
    `Address: ${input.address}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Origin: ${origin}`,
  ].join("\n");
};

export type WalletAuthMessageResult = {
  message: string;
  /** True when nonce was issued by Pay Hub API (enables Firebase custom-token exchange). */
  serverNonce: boolean;
};

export const createWalletAuthMessage = async (address: string): Promise<WalletAuthMessageResult> => {
  const origin = resolveWalletAuthOrigin();
  if (isWalletAuthApiConfigured()) {
    try {
      const { nonce, issuedAt } = await fetchWalletAuthNonce(address);
      return {
        message: buildWalletAuthMessage({ address, nonce, issuedAt, origin }),
        serverNonce: true,
      };
    } catch {
      /* Server nonce unavailable, fall back to local signing (wallet session still works). */
    }
  }
  return {
    message: buildWalletAuthMessage({
      address,
      nonce: crypto.randomUUID().replace(/-/g, ""),
      issuedAt: new Date().toISOString(),
      origin,
    }),
    serverNonce: false,
  };
};

const enforceLockedSessionProvider = (
  address: string,
  provider: WalletProvider,
): WalletProvider => {
  const addrLower = address.trim().toLowerCase();

  const primaryLock = loadPrimaryWalletLock();
  if (primaryLock?.address.toLowerCase() === addrLower) {
    if (primaryLock.provider === "embedded:garuda" || isGarudaNativeWalletType(primaryLock.walletType)) {
      return "embedded:garuda";
    }
    return primaryLock.provider;
  }

  const addrLock = resolveAddressLockedProvider(address);
  if (addrLock) return addrLock;

  return provider;
};

const persistWallet = (wallet: ConnectedWallet) => {
  const locked = {
    ...wallet,
    provider: enforceLockedSessionProvider(wallet.address, wallet.provider),
  };
  secureSet(WALLET_KEY, JSON.stringify(locked));
  return locked;
};

/** Activate a previously linked wallet as the current session (no re-connect). */
export const storeConnectedWalletSession = (input: {
  address: string;
  provider: WalletProvider;
  network?: string;
}): ConnectedWallet =>
  persistWallet({
    address: input.address,
    provider: input.provider,
    chainId: SIDRA_CHAIN.chainId,
    network: input.network ?? SIDRA_CHAIN.name,
    connected: true,
  });

const getInjectedProvider = (provider: WalletProvider): TrustEthereumProvider | undefined =>
  getInjectedEthereumProvider(provider);

const connectInjected = async (
  eth: TrustEthereumProvider,
  provider: WalletProvider,
  options?: ConnectWalletOptions,
): Promise<ConnectedWallet> => {
  let accounts: string[];
  try {
    accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : "";
    if (msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel")) {
      throw Object.assign(e instanceof Error ? e : new Error("User rejected"), { code: "wallet/user-rejected" });
    }
    throw e;
  }

  if (!accounts?.length) throw new Error("No accounts returned");

  const chainId = options?.skipNetworkSwitch === false
    ? await ensureSidraNetwork(eth)
    : SIDRA_CHAIN.chainId;

  return persistWallet({
    address: accounts[0],
    provider,
    chainId,
    network: SIDRA_CHAIN.name,
    connected: true,
  });
};

const connectViaWalletConnect = async (
  preferTrustWallet = false,
  options?: ConnectWalletOptions,
): Promise<ConnectedWallet> => {
  if (options?.forceNewWalletConnectSession) {
    await disconnectWalletConnect();
  }
  if (!isWalletConnectConfigured()) {
    if (isDemoAuthAllowed()) {
      return persistWallet({
        address: generateDemoAddress(),
        provider: "walletconnect",
        chainId: SIDRA_CHAIN.chainId,
        network: SIDRA_CHAIN.name,
        connected: true,
      });
    }
    throw new Error("WalletConnect not configured. Set VITE_WALLETCONNECT_PROJECT_ID.");
  }

  const { address } = await connectWalletConnect({
    ...(preferTrustWallet ? { preferTrustWallet: true } : { preferMetaMask: true }),
    ...(options?.forceNewWalletConnectSession ? { forceNewSession: true } : {}),
  });
  return persistWallet({
    address,
    provider: preferTrustWallet ? "trustwallet" : "metamask",
    chainId: SIDRA_CHAIN.chainId,
    network: SIDRA_CHAIN.name,
    connected: true,
  });
};

/** Trust Wallet: extension → WalletConnect (mobile/desktop) → deep link hint */
const connectTrustWallet = async (options?: ConnectWalletOptions): Promise<ConnectedWallet> => {
  const injected = getTrustProvider();
  if (injected && !options?.forceNewWalletConnectSession) {
    return connectInjected(injected, "trustwallet", options);
  }

  if (isWalletConnectConfigured()) {
    return connectViaWalletConnect(true, options);
  }

  if (isMobileDevice()) {
    openTrustWalletMobile();
    throw new TrustWalletError(
      "Buka Trust Wallet app, lalu scan QR atau gunakan in-app browser",
      "wallet/trust-mobile",
    );
  }

  throw new TrustWalletError(
    "Install Trust Wallet extension di browser Anda",
    "wallet/trust-not-found",
  );
};

export const connectWallet = async (
  provider: WalletProvider,
  options?: ConnectWalletOptions,
): Promise<ConnectedWallet> => {
  const fastConnect = options?.skipNetworkSwitch !== false;

  if (provider === "walletconnect") {
    const injected = getInjectedEthereumProvider();
    if (injected && !options?.forceNewWalletConnectSession) {
      const kind: WalletProvider = getMetaMaskInjected() === injected
        ? "metamask"
        : isTrustWalletInjected()
          ? "trustwallet"
          : "metamask";
      return connectInjected(injected, kind, options);
    }
    return connectViaWalletConnect(false, options);
  }

  if (provider === "trustwallet") {
    try {
      return await connectTrustWallet(options);
    } catch (e) {
      if (e instanceof TrustWalletError || (e && typeof e === "object" && "code" in e)) {
        throw e;
      }
      /* demo fallback only for unexpected errors in dev */
      if (isDemoAuthAllowed() && !import.meta.env.VITE_WALLETCONNECT_PROJECT_ID && !isTrustWalletInjected()) {
        return persistWallet({
          address: generateDemoAddress(),
          provider: "trustwallet",
          chainId: SIDRA_CHAIN.chainId,
          network: SIDRA_CHAIN.name,
          connected: true,
        });
      }
      throw e;
    }
  }

  const eth = getInjectedProvider(provider);
  if (eth) {
    try {
      return await connectInjected(eth, provider, options);
    } catch (e) {
      if (e && typeof e === "object" && "code" in e) throw e;
    }
  }

  if (provider === "metamask" && isWalletConnectConfigured()) {
    return connectViaWalletConnect(false, options);
  }

  if (isDemoAuthAllowed()) {
    return persistWallet({
      address: generateDemoAddress(),
      provider,
      chainId: SIDRA_CHAIN.chainId,
      network: SIDRA_CHAIN.name,
      connected: true,
    });
  }

  throw new Error("No wallet provider available. Install MetaMask or configure WalletConnect.");
};

export const signMessage = async (address: string, message: string, provider?: WalletProvider): Promise<string> => {
  try {
    const eth = await resolveSigningProvider(address, provider);
    const sig = await eth.request({
      method: "personal_sign",
      params: [message, address],
    });
    return sig as string;
  } catch (e) {
    if (isDemoAuthAllowed()) return `0xdemo_sig_${Date.now()}`;
    throw e;
  }
};

export const verifyWalletSignature = async (
  address: string,
  message: string,
  signature: string,
): Promise<boolean> => {
  if (signature.startsWith("0xdemo_sig_")) return isDemoAuthAllowed();
  if (!/^0x[a-fA-F0-9]{130}$/.test(signature)) return false;
  try {
    return await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    return false;
  }
};

export const formatAddress = (addr?: string | null) => {
  const safe = addr?.trim() ?? "";
  if (!safe) return ", ";
  return safe.length > 10 ? `${safe.slice(0, 6)}…${safe.slice(-4)}` : safe;
};

/** True when a display name is a wallet address (full or shortened with … or ...). */
export const isWalletDisplayName = (name: string): boolean => {
  const n = name.trim();
  if (/^0x[a-fA-F0-9]{40}$/i.test(n)) return true;
  return /^0x[a-fA-F0-9]{2,8}(?:\.{3}|…)[a-fA-F0-9]{2,8}$/i.test(n);
};

export const getStoredWallet = (): ConnectedWallet | null => {
  try {
    const raw = secureGet(WALLET_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConnectedWallet;
  } catch {
    return null;
  }
};

/** Hapus sesi dompet lokal, wajib saat logout agar login ulang tidak membawa tipe lama. */
export const clearConnectedWalletSession = () => {
  secureRemove(WALLET_KEY);
};

const isEthAddress = (value?: string | null): value is string =>
  Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value.trim()));

/**
 * Resolve wallet session for signing, stored session first, then live/profile address.
 * Injected / in-app wallets are preferred when reconnecting.
 */
export const resolveWalletSession = (fallbackAddress?: string | null): ConnectedWallet | null => {
  const stored = getStoredWallet();
  if (stored?.address && isEthAddress(stored.address)) return stored;

  const fromFallback = fallbackAddress?.trim();
  if (!isEthAddress(fromFallback)) return null;

  const provider = stored?.provider ?? resolvePreferredWalletProvider();
  return {
    address: fromFallback,
    provider,
    chainId: SIDRA_CHAIN.chainId,
    network: SIDRA_CHAIN.name,
    connected: Boolean(stored?.connected),
  };
};

export { openTrustWalletMobile, openMetaMaskMobile, TRUST_WALLET_INSTALL_URL } from "./trustWalletProvider";
