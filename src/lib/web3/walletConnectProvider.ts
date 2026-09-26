import type EthereumProviderType from "@walletconnect/ethereum-provider";
import { SIDRA_CHAIN } from "./sidraNetwork";
import { GARUDA_CHAIN } from "./garudaChain";
import { TRUST_WALLET_WC_ID, METAMASK_WC_ID, isMobileDevice } from "./trustWalletProvider";
import { APP_ORIGIN, faviconUrl } from "../app/branding";
import type { WalletProvider } from "./walletService";
import { resolveWalletAppProvider, walletConnectOptionsForApp } from "./walletAppRouting";
import { attachWalletConnectMobileHandlers } from "./walletConnectMobileLink";

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "";

type WcProvider = InstanceType<typeof EthereumProviderType>;

let wcModalPrimed = false;
const primeWalletConnectModal = async (): Promise<void> => {
  if (wcModalPrimed) return;
  wcModalPrimed = true;
  try {
    await import("@walletconnect/modal");
  } catch {
    wcModalPrimed = false;
  }
};

/** Required chain for WalletConnect, must be widely supported (Trust, Bitget, Coinbase, etc.) */
const WC_REQUIRED_CHAIN = 1;
const WC_ETHEREUM_RPC =
  import.meta.env.VITE_ETHEREUM_RPC_URL?.trim() || "https://ethereum.publicnode.com";

const WC_OPTIONAL_CHAINS = [...new Set([
  WC_REQUIRED_CHAIN,
  SIDRA_CHAIN.chainId,
  GARUDA_CHAIN.chainId,
])];

let wcProvider: WcProvider | null = null;
let wcInitPromise: Promise<WcProvider> | null = null;
let wcPeerWalletName: string | null = null;

const loadEthereumProvider = async () => {
  const mod = await import("@walletconnect/ethereum-provider");
  await primeWalletConnectModal();
  return mod.default;
};

const syncPeerFromProvider = (provider: WcProvider) => {
  const session = (provider as { session?: { peer?: { metadata?: { name?: string } } } }).session;
  const name = session?.peer?.metadata?.name;
  if (typeof name === "string" && name.trim()) {
    wcPeerWalletName = name.trim();
  }
};

export const syncWalletConnectPeerName = () => {
  if (wcProvider) syncPeerFromProvider(wcProvider);
  return wcPeerWalletName;
};

export const getWalletConnectPeerName = () => wcPeerWalletName;

const attachWalletConnectListeners = (provider: WcProvider) => {
  syncPeerFromProvider(provider);
  attachWalletConnectMobileHandlers(provider);
  provider.on?.("connect", () => syncPeerFromProvider(provider));
  provider.on?.("session_update", () => syncPeerFromProvider(provider));
  provider.on?.("accountsChanged", () => syncPeerFromProvider(provider));
};

export type WalletConnectOptions = {
  /** Pin Trust Wallet at top of WalletConnect modal */
  preferTrustWallet?: boolean;
  /** Pin MetaMask at top of WalletConnect modal */
  preferMetaMask?: boolean;
  /** Disconnect cached session and open a fresh pairing (link another wallet). */
  forceNewSession?: boolean;
  /** When set, pick this account from the session instead of the first account. */
  expectedAddress?: string;
};

export const isWalletConnectConfigured = () => Boolean(PROJECT_ID);

const initWalletConnectProvider = async (options?: WalletConnectOptions) => {
  if (!PROJECT_ID) {
    throw Object.assign(new Error("VITE_WALLETCONNECT_PROJECT_ID is not configured"), {
      code: "wallet/wc-not-configured",
    });
  }

  const EthereumProvider = await loadEthereumProvider();
  return EthereumProvider.init({
    projectId: PROJECT_ID,
    chains: [WC_REQUIRED_CHAIN],
    optionalChains: WC_OPTIONAL_CHAINS,
    /* Mobile uses deep link to wallet app; QR modal package fails on mobile browsers. */
    showQrModal: !isMobileDevice(),
    rpcMap: {
      [WC_REQUIRED_CHAIN]: WC_ETHEREUM_RPC,
      [SIDRA_CHAIN.chainId]: SIDRA_CHAIN.rpcUrl,
      [GARUDA_CHAIN.chainId]: GARUDA_CHAIN.rpcUrl,
    },
    metadata: {
      name: "Garuda Prime",
      description: "Syariah Web3 Fintech, SDA Sidra Network",
      url: APP_ORIGIN,
      icons: [faviconUrl(APP_ORIGIN)],
      redirect: {
        native: APP_ORIGIN,
        universal: APP_ORIGIN,
      },
    },
    ...(options?.preferTrustWallet
      ? {
          qrModalOptions: {
            explorerRecommendedWalletIds: [TRUST_WALLET_WC_ID],
          },
        }
      : {}),
    ...(options?.preferMetaMask
      ? {
          qrModalOptions: {
            explorerRecommendedWalletIds: [METAMASK_WC_ID],
          },
        }
      : {}),
  });
};

export const getWalletConnectProvider = async (options?: WalletConnectOptions) => {
  if (wcProvider) return wcProvider;
  if (!wcInitPromise) {
    wcInitPromise = initWalletConnectProvider(options).then((provider) => {
      wcProvider = provider;
      attachWalletConnectListeners(provider);
      return provider;
    }).finally(() => {
      wcInitPromise = null;
    });
  }
  return wcInitPromise;
};

/** Do not auto-init WalletConnect on app load, init when modal opens or user connects. */
export const preloadWalletConnect = (): void => {
  /* load lazily on connectWalletConnect() */
};

/** Warm WC SDK while panel is open so the first tap is faster on mobile. */
export const warmWalletConnectForProvider = (provider?: WalletProvider): void => {
  if (provider === "embedded:garuda" || provider === "embedded:privy" || provider === "embedded:external") {
    return;
  }
  if (!isWalletConnectConfigured() || !PROJECT_ID) return;
  syncWalletConnectPeerName();
  void getWalletConnectProvider(walletConnectOptionsForApp(provider, getWalletConnectPeerName()));
};

const pickWalletConnectAccount = (
  accounts: string[] | undefined,
  expected?: string,
): string | null => {
  const list = accounts ?? [];
  if (!list.length) return null;
  if (expected) {
    const match = list.find((a) => a.toLowerCase() === expected.toLowerCase());
    if (match) return match;
    return null;
  }
  return list[0];
};

const collectWalletConnectAccounts = async (
  provider: WcProvider,
): Promise<string[]> => {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (list?: string[]) => {
    for (const addr of list ?? []) {
      const key = addr.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(addr);
    }
  };
  add(provider.accounts);
  try {
    add((await provider.request({ method: "eth_accounts" })) as string[]);
  } catch {
    /* optional */
  }
  return out;
};

export const connectWalletConnect = async (options?: WalletConnectOptions): Promise<{
  provider: WcProvider;
  address: string;
}> => {
  if (options?.forceNewSession) {
    await disconnectWalletConnect();
  }
  const provider = await getWalletConnectProvider(options);
  const expected = options?.expectedAddress?.trim();

  const existingAccounts = await collectWalletConnectAccounts(provider);
  const existing = pickWalletConnectAccount(existingAccounts, expected);
  if (existing) {
    syncPeerFromProvider(provider);
    return { provider, address: existing };
  }
  if (expected && existingAccounts.length > 0 && !options?.forceNewSession) {
    return connectWalletConnect({ ...options, forceNewSession: true });
  }

  try {
    const requested = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    const picked = pickWalletConnectAccount(requested, expected);
    if (picked) return { provider, address: picked };
    if (requested?.length && !expected) return { provider, address: requested[0] };
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : "";
    if (msg.includes("rejected") || msg.includes("denied") || msg.includes("closed")) {
      throw Object.assign(e instanceof Error ? e : new Error("User rejected"), { code: "wallet/user-rejected" });
    }
    /* stale session, fall through to enable() */
  }

  try {
    await provider.enable();
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : "";
    if (msg.includes("rejected") || msg.includes("denied") || msg.includes("closed")) {
      throw Object.assign(e instanceof Error ? e : new Error("User rejected"), { code: "wallet/user-rejected" });
    }
    if (msg.includes("chains are not supported") || msg.includes("chain not supported")) {
      throw Object.assign(
        e instanceof Error ? e : new Error("Wallet does not support requested network"),
        { code: "wallet/chain-not-supported" },
      );
    }
    throw e;
  }

  const afterEnableAccounts = await collectWalletConnectAccounts(provider);
  const afterEnable = pickWalletConnectAccount(afterEnableAccounts, expected);
  if (afterEnable) {
    return { provider, address: afterEnable };
  }

  const requested = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const picked = pickWalletConnectAccount(requested, expected);
  if (picked) return { provider, address: picked };
  if (!requested?.length) throw new Error("No accounts returned from WalletConnect");
  return { provider, address: requested[0] };
};

export const disconnectWalletConnect = async () => {
  if (wcProvider) {
    await wcProvider.disconnect();
    wcProvider = null;
  }
  wcInitPromise = null;
};

export const getActiveWalletConnectProvider = () => wcProvider;
