import { hideInstantAuthGate } from "../auth/authGateOverlay";
import { clearPendingAuthPhase, readPendingAuthPhase } from "../auth/accountSetup";
import { clearOAuthPending, isOAuthPending } from "../auth/oauthTransition";
import { hasSession } from "../security/secureStorage";
import { destroySession, getSessionUidSync, validateSession } from "../security/sessionManager";
import {
  hasKycPortOAuthCallbackParams,
  isKycPortCallbackPath,
} from "../kyc/kycportCallbackParams";
import { isKycPortAwaiting, setKycPortAwaiting } from "../kyc/kycportOAuthFlow";
import { clearKycPortOAuth, loadKycPortOAuth } from "../kyc/kycportStorage";

export const VERSION_RELOAD_GUARD_KEY = "gp_version_reload_guard";

/** Remove HTML-level shells that can block the React app after boot. */
export function clearBootBlockers(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("gp-splash-active", "gp-oauth-pending");
  hideInstantAuthGate();
}

/** Drop stale OAuth flags left from an interrupted Google/Apple redirect. */
export function clearStaleOAuthPending(): void {
  if (typeof window === "undefined" || !isOAuthPending()) return;
  if (isKycPortCallbackPath() && hasKycPortOAuthCallbackParams()) return;

  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const hasAuthParams =
    params.has("code")
    || params.has("state")
    || params.has("error")
    || hashParams.has("code")
    || hashParams.has("state")
    || hashParams.has("access_token");

  if (hasAuthParams) return;

  clearOAuthPending();
  hideInstantAuthGate();
}

export function clearOAuthIfSessionReady(): void {
  if (isKycPortCallbackPath() && hasKycPortOAuthCallbackParams()) return;
  if (hasSession() && validateSession().valid) {
    clearOAuthPending();
  }
}

/**
 * Drop orphaned registration/OAuth/KYC flags that leave the UI on a blank shell.
 * Safe to call on every cold boot (before React mounts).
 */
export function sanitizeBootAuthState(): void {
  if (typeof window === "undefined") return;
  clearStaleOAuthPending();
  clearBootBlockers();

  if (isKycPortCallbackPath() && hasKycPortOAuthCallbackParams()) return;

  const session = validateSession();
  const pending = readPendingAuthPhase();
  const uid = session.uid ?? getSessionUidSync();

  if (!session.valid) {
    if (hasSession()) destroySession();
    if (pending) clearPendingAuthPhase();
    clearOAuthPending();
    const kycOauthInFlight = isKycPortAwaiting() || Boolean(loadKycPortOAuth());
    if (!kycOauthInFlight) {
      setKycPortAwaiting(false);
      clearKycPortOAuth();
    }
    return;
  }

  if (pending && !uid) clearPendingAuthPhase();
  if (isOAuthPending()) clearOAuthPending();
}

/** Prevent infinite reload loops when localStorage is blocked or version checks race. */
export function shouldReloadForAppVersion(prev: string | null, next: string): boolean {
  if (!prev || prev === next) return false;
  try {
    if (sessionStorage.getItem(VERSION_RELOAD_GUARD_KEY) === next) return false;
    sessionStorage.setItem(VERSION_RELOAD_GUARD_KEY, next);
    return true;
  } catch {
    return false;
  }
}

export function persistAppVersion(version: string): void {
  try {
    localStorage.setItem("gp-app-version", version);
  } catch {
    /* private mode / quota */
  }
}
