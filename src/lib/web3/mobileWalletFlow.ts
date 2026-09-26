import {
  getActiveWalletConnectProvider,
  syncWalletConnectPeerName,
} from "./walletConnectProvider";
import {
  getInjectedEthereumProvider,
} from "./walletProviderResolution";
import type { TrustEthereumProvider } from "./trustWalletProvider";
import { isMobileDevice } from "./trustWalletProvider";
import type { WalletProvider } from "./walletService";
import type { TransferProgress } from "./walletTransfer";

/** Wait until the browser tab is visible again (e.g. after returning from wallet app). */
export const waitUntilPageVisible = (maxMs = 10_000): Promise<void> =>
  new Promise((resolve) => {
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      resolve();
      return;
    }
    const deadline = Date.now() + maxMs;
    const cleanup = () => {
      document.removeEventListener("visibilitychange", onChange);
      resolve();
    };
    const onChange = () => {
      if (document.visibilityState === "visible") cleanup();
    };
    document.addEventListener("visibilitychange", onChange);
    const poll = () => {
      if (document.visibilityState === "visible" || Date.now() >= deadline) cleanup();
      else window.setTimeout(poll, 200);
    };
    poll();
  });

/** Ping WalletConnect relay, wakes stale mobile sessions after returning from wallet app. */
export const refreshWalletConnectSession = async (): Promise<boolean> => {
  syncWalletConnectPeerName();
  const wc = getActiveWalletConnectProvider();
  if (!wc) return false;
  try {
    await wc.request({ method: "eth_accounts" });
    return true;
  } catch {
    return false;
  }
};

export type MobileWalletFlowStep = TransferProgress | "confirming" | "idle";

export type MobileWalletFlowOptions = {
  active: boolean;
  step: MobileWalletFlowStep;
  provider?: WalletProvider;
  onResume?: () => void;
};

export const attachMobileWalletFlow = ({
  active,
  step,
  onResume,
}: MobileWalletFlowOptions): (() => void) => {
  if (!active || step === "idle" || step === "confirming" || step === "submitted") {
    return () => undefined;
  }

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    if (step === "connect" || step === "network" || step === "sign") {
      void refreshWalletConnectSession();
      onResume?.();
    }
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", onVisible);

  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pageshow", onVisible);
  };
};

export const pingEthereumProvider = async (
  eth: TrustEthereumProvider | null | undefined,
): Promise<boolean> => {
  if (!eth) return false;
  try {
    await eth.request({ method: "eth_accounts" });
    return true;
  } catch {
    return false;
  }
};

/** @deprecated WalletConnect handles mobile redirects via session_request_sent. */
export const promptMobileWalletApp = (_provider?: WalletProvider) => {
  if (!isMobileDevice() || getInjectedEthereumProvider(_provider)) return;
};

/** @deprecated WalletConnect session_request_sent opens the confirmation portal. */
export const promptMobileWalletAppAfterRequest = async (_provider?: WalletProvider) => {
  if (!isMobileDevice() || getInjectedEthereumProvider(_provider)) return;
};
