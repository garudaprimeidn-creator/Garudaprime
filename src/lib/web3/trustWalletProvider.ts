/** Trust Wallet, browser extension, multi-provider, mobile deep link & WalletConnect */

export type TrustEthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isTrust?: boolean;
  isMetaMask?: boolean;
  providers?: TrustEthereumProvider[];
};

declare global {
  interface Window {
    trustwallet?: TrustEthereumProvider;
    ethereum?: TrustEthereumProvider;
  }
}

/** WalletConnect explorer ID for Trust Wallet */
export const TRUST_WALLET_WC_ID = "4622a2b2d6af1c984494844e592e070954";

/** WalletConnect explorer ID for MetaMask */
export const METAMASK_WC_ID = "c57ca95a4753b246c5319c8f6576b4a86a6a579";

export const TRUST_WALLET_INSTALL_URL = "https://trustwallet.com/download";

export const METAMASK_INSTALL_URL = "https://metamask.io/download/";

export const isMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export const isTrustWalletInjected = () => Boolean(getTrustProvider());

/** Resolve Trust provider when MetaMask + Trust both installed (EIP-6963 / providers array) */
export const getTrustProvider = (): TrustEthereumProvider | undefined => {
  if (window.trustwallet?.isTrust !== false) {
    return window.trustwallet;
  }

  const eth = window.ethereum;
  if (!eth) return undefined;

  if (eth.isTrust) return eth;

  if (Array.isArray(eth.providers)) {
    const trust = eth.providers.find((p) => p.isTrust);
    if (trust) return trust;
  }

  return undefined;
};

/** Open wallet companion app, native scheme only (avoids browser install/download pages). */
export const openTrustWalletMobile = (targetUrl?: string) => {
  if (!isMobileDevice()) return;
  const url = targetUrl ?? window.location.href;
  launchNativeWalletApp([
    `trust://open_url?coin_id=97453&url=${encodeURIComponent(url)}`,
    `tw://open_url?coin_id=97453&url=${encodeURIComponent(url)}`,
  ], "com.wallet.crypto.trustapp");
};

/** Open MetaMask app home, avoid for WC signing (use walletConnectMobileLink instead). */
export const openMetaMaskMobile = () => {
  if (!isMobileDevice()) return;
  launchNativeWalletApp(["metamask://"], "io.metamask");
};

const launchNativeWalletApp = (schemeUrls: string[], androidPackage?: string) => {
  const urls = [...schemeUrls];
  if (androidPackage && /Android/i.test(navigator.userAgent)) {
    for (const scheme of schemeUrls) {
      const path = scheme.replace(/^[^:]+:\/\//, "");
      urls.unshift(
        `intent://${path}#Intent;package=${androidPackage};scheme=${scheme.split(":")[0]};end`,
      );
    }
  }

  for (const url of urls) {
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.style.display = "none";
      anchor.setAttribute("rel", "noopener noreferrer");
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return;
    } catch {
      /* try next scheme */
    }
  }
};

export class TrustWalletError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "TrustWalletError";
    this.code = code;
  }
}

export const assertTrustWalletAvailable = () => {
  if (isTrustWalletInjected()) return;
  if (isMobileDevice()) {
    throw new TrustWalletError(
      "Trust Wallet app required, connect via WalletConnect or open in Trust Browser",
      "wallet/trust-mobile",
    );
  }
  throw new TrustWalletError(
    "Trust Wallet extension not detected, install Trust Wallet browser extension",
    "wallet/trust-not-found",
  );
};
