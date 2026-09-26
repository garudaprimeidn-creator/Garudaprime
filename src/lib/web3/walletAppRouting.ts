import { secureGet, WALLET_KEY } from "../security/secureStorage";

export type WalletProviderKind = "metamask" | "walletconnect" | "trustwallet";

/** Aplikasi dompet yang harus dibuka di mobile, MetaMask atau Trust Wallet. */
export type WalletAppTarget = "metamask" | "trustwallet";

export type WalletConnectPreferOptions = {
  preferTrustWallet?: boolean;
  preferMetaMask?: boolean;
};

const readStoredProvider = (): WalletProviderKind | undefined => {
  try {
    const raw = secureGet(WALLET_KEY);
    if (!raw) return undefined;
    return (JSON.parse(raw) as { provider?: WalletProviderKind }).provider;
  } catch {
    return undefined;
  }
};

/**
 * Tentukan app dompet dari provider sesi, WC peer, atau storage lokal.
 * Tidak pernah default ke Trust, MetaMask jika tidak jelas.
 */
export const resolveWalletAppProvider = (
  provider?: WalletProviderKind | null,
  wcPeerName?: string | null,
): WalletAppTarget => {
  if (provider === "metamask") return "metamask";
  if (provider === "trustwallet") return "trustwallet";

  const peer = (wcPeerName ?? "").toLowerCase();
  if (peer.includes("metamask")) return "metamask";
  if (peer.includes("trust")) return "trustwallet";

  const stored = readStoredProvider();
  if (stored === "metamask" || stored === "trustwallet") return stored;

  return "metamask";
};

export const walletConnectOptionsForApp = (
  provider?: WalletProviderKind | null,
  wcPeerName?: string | null,
): WalletConnectPreferOptions =>
  resolveWalletAppProvider(provider, wcPeerName) === "trustwallet"
    ? { preferTrustWallet: true }
    : { preferMetaMask: true };
