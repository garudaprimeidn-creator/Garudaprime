import "./lib/polyfills/buffer";
import { createRoot } from "react-dom/client";
import { AppToaster } from "./app/appToast.tsx";
import { ThemeProvider } from "./app/ThemeContext.tsx";
import { LanguageProvider } from "./app/LanguageContext.tsx";
import { AuthProvider } from "./contexts/AuthContext.tsx";
import { EmbeddedWalletProvider } from "./lib/web3/EmbeddedWalletProvider.tsx";
import App from "./app/App.tsx";
import { AppErrorBoundary } from "./app/AppErrorBoundary.tsx";
import { runKycPortCallbackBridge } from "./lib/kyc/kycportOAuthFlow";
import {
  preserveKycPortCallbackSnapshot,
  isKycPortCallbackPath,
  hasKycPortOAuthCallbackParams,
} from "./lib/kyc/kycportCallbackParams";
import { isKycPortAwaiting, setKycPortAwaiting } from "./lib/kyc/kycportOAuthFlow";
import { loadKycPortOAuth } from "./lib/kyc/kycportStorage";
import { bootstrapReferralEntry } from "./lib/referral/referralRef";
import { bootstrapAppEntryUrl } from "./lib/app/appEntry";
import { redirectMarketingHostToApp } from "./lib/app/marketingHostRedirect";
import {
  clearBootBlockers,
  clearOAuthIfSessionReady,
  sanitizeBootAuthState,
} from "./lib/app/bootCleanup";
import "./styles/index.css";

declare global {
  interface Window {
    __GP_APP_MOUNTED__?: boolean;
  }
}

function runSafeBoot(): void {
  try {
    bootstrapReferralEntry();
    bootstrapAppEntryUrl();
    preserveKycPortCallbackSnapshot();
    runKycPortCallbackBridge();
  } catch (err) {
    console.error("[Garuda Prime] boot", err);
  }

  if (typeof window === "undefined") return;

  try {
    if (isKycPortCallbackPath() && !hasKycPortOAuthCallbackParams()) {
      setKycPortAwaiting(false);
      window.history.replaceState({}, "", "/");
    } else if (!isKycPortCallbackPath()) {
      const oauthInFlight = isKycPortAwaiting() || Boolean(loadKycPortOAuth());
      if (!oauthInFlight) setKycPortAwaiting(false);
    }
    sanitizeBootAuthState();
    clearOAuthIfSessionReady();
    clearBootBlockers();
    window.setTimeout(clearBootBlockers, 12_000);
    window.setTimeout(sanitizeBootAuthState, 8_000);
  } catch (err) {
    console.error("[Garuda Prime] boot cleanup", err);
    clearBootBlockers();
  }
}

function mountApp(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) return;

  document.getElementById("gp-static-boot")?.remove();

  createRoot(rootEl).render(
    <AppErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <EmbeddedWalletProvider>
              <AppToaster />
              <App />
            </EmbeddedWalletProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </AppErrorBoundary>,
  );

  window.__GP_APP_MOUNTED__ = true;
}

const reloadOnceForChunkError = (() => {
  let reloaded = false;
  return () => {
    if (reloaded) return;
    reloaded = true;
    try {
      const key = "gp_chunk_reload";
      const prev = sessionStorage.getItem(key);
      const stamp = String(Date.now());
      if (prev && Date.now() - Number(prev) < 30_000) return;
      sessionStorage.setItem(key, stamp);
    } catch {
      /* ignore */
    }
    window.location.reload();
  };
})();

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnceForChunkError();
});

runSafeBoot();
if (redirectMarketingHostToApp()) {
  /* navigation in progress */
} else try {
  mountApp();
} catch (err) {
  console.error("[Garuda Prime] mount failed", err);
  clearBootBlockers();
  const path = `${window.location.pathname}${window.location.search}`;
  if (!path.includes("entry=auth")) {
    window.location.replace("/?entry=auth");
  }
}
