import {
  clearReferralSessionState,
  isReferralProgramAvailable,
} from "./referralProgramGate";
import { DEFAULT_APP_ORIGIN } from "../app/domains";
import { destroySession } from "../security/sessionManager";
import { secureRemove, WALLET_KEY } from "../security/secureStorage";
import { clearOAuthPending } from "../auth/oauthTransition";
import { hideInstantAuthGate } from "../auth/authGateOverlay";
import {
  clearAccountPreview,
  clearPendingAuthPhase,
  clearRegistrationStep,
  clearRegistrationWallet,
} from "../auth/accountSetup";

const STORAGE_KEY = "gp_pending_referral_code";
const REFERRAL_GUEST_KEY = "gp_referral_guest_landing";

export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function hasReferralInUrl(search = typeof window !== "undefined" ? window.location.search : ""): boolean {
  if (!search) return false;
  const params = new URLSearchParams(search);
  return Boolean(params.get("ref")?.trim() || params.get("referral")?.trim());
}

export function captureReferralFromUrl(search = typeof window !== "undefined" ? window.location.search : ""): string | null {
  if (!isReferralProgramAvailable()) return null;
  if (!search) return null;
  const params = new URLSearchParams(search);
  const ref = params.get("ref") || params.get("referral");
  if (!ref?.trim()) return null;
  const code = normalizeReferralCode(ref);
  try {
    sessionStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
  clearReferralFromUrl();
  return code;
}

export function isReferralGuestLanding(): boolean {
  try {
    return sessionStorage.getItem(REFERRAL_GUEST_KEY) === "1";
  } catch {
    return false;
  }
}

export function markReferralGuestLanding(): void {
  try {
    sessionStorage.setItem(REFERRAL_GUEST_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearReferralGuestLanding(): void {
  try {
    sessionStorage.removeItem(REFERRAL_GUEST_KEY);
  } catch {
    /* ignore */
  }
}

/** Active referral invite, guest has not finished sign-in / sign-up yet. */
export function isReferralEntryActive(): boolean {
  if (!isReferralProgramAvailable()) return false;
  return Boolean(getPendingReferralCode()) || isReferralGuestLanding();
}

/** Drop stale partial signup so referral links always open login, not wallet setup. */
export function prepareReferralGuestLanding(): void {
  clearPendingAuthPhase();
  clearRegistrationStep();
  clearRegistrationWallet();
  clearAccountPreview();
  destroySession();
  secureRemove(WALLET_KEY);
  clearOAuthPending();
  markReferralGuestLanding();
  hideInstantAuthGate();
}

/**
 * Capture referral from URL and reset stale wallet/oauth state.
 * Safe to call synchronously before React boot (main.tsx + inline index.html).
 */
export function bootstrapReferralEntry(search = typeof window !== "undefined" ? window.location.search : ""): boolean {
  if (typeof window === "undefined") return false;
  if (!isReferralProgramAvailable()) {
    clearReferralSessionState();
    clearReferralFromUrl();
    return false;
  }
  const fromUrl = hasReferralInUrl(search);
  if (fromUrl) captureReferralFromUrl(search);
  if (!fromUrl && !getPendingReferralCode()) return false;
  prepareReferralGuestLanding();
  return true;
}

export function clearReferralFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("ref") && !url.searchParams.has("referral")) return;
  url.searchParams.delete("ref");
  url.searchParams.delete("referral");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function getPendingReferralCode(): string | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? normalizeReferralCode(raw) : null;
  } catch {
    return null;
  }
}

export function clearPendingReferralCode(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function buildReferralShareUrl(code: string, origin = DEFAULT_APP_ORIGIN): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/?entry=auth&ref=${encodeURIComponent(normalizeReferralCode(code))}`;
}
