import { DEFAULT_APP_ORIGIN } from "./domains";

export type AppEntry = "onboarding" | "auth";
export type AppEntryFlow = "wallet-otp";

const APP_ENTRY_STASH_KEY = "gp_app_entry";
const APP_FLOW_STASH_KEY = "gp_app_flow";

/** Marketing CTA, open app directly on onboarding (skip splash) */
export const APP_ONBOARDING_URL = `${DEFAULT_APP_ORIGIN}/?entry=onboarding`;

/** Email OTP CTA, skip splash, open login or resume wallet OTP step */
export const APP_AUTH_WALLET_OTP_URL = `${DEFAULT_APP_ORIGIN}/?entry=auth&flow=wallet-otp`;

export const readAppEntry = (): AppEntry | null => {
  if (typeof window === "undefined") return null;
  const entry = new URLSearchParams(window.location.search).get("entry");
  if (entry === "onboarding") return "onboarding";
  if (entry === "auth" || entry === "login") return "auth";
  try {
    const stashed = sessionStorage.getItem(APP_ENTRY_STASH_KEY);
    if (stashed === "onboarding" || stashed === "auth") {
      sessionStorage.removeItem(APP_ENTRY_STASH_KEY);
      return stashed;
    }
  } catch { /* private mode */ }
  return null;
};

export const readAppFlow = (): AppEntryFlow | null => {
  if (typeof window === "undefined") return null;
  const flow = new URLSearchParams(window.location.search).get("flow");
  if (flow === "wallet-otp") return "wallet-otp";
  try {
    const stashed = sessionStorage.getItem(APP_FLOW_STASH_KEY)
      ?? localStorage.getItem(APP_FLOW_STASH_KEY);
    if (stashed === "wallet-otp") return "wallet-otp";
  } catch { /* private mode */ }
  return null;
};

/** One-shot read, clears stashed flow after consumption. */
export const consumeAppFlow = (): AppEntryFlow | null => {
  const flow = readAppFlow();
  if (flow) {
    try {
      sessionStorage.removeItem(APP_FLOW_STASH_KEY);
      localStorage.removeItem(APP_FLOW_STASH_KEY);
    } catch { /* ignore */ }
  }
  return flow;
};

export const clearAppEntryFromUrl = () => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const hadEntry = url.searchParams.has("entry");
  const hadFlow = url.searchParams.has("flow");
  if (!hadEntry && !hadFlow) return;
  url.searchParams.delete("entry");
  url.searchParams.delete("flow");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
};

/** Stash ?entry= / ?flow= then strip URL so refresh does not loop onboarding. */
export const bootstrapAppEntryUrl = () => {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const entry = params.get("entry");
  const flow = params.get("flow");

  if (entry === "onboarding" || entry === "auth" || entry === "login") {
    try {
      sessionStorage.setItem(APP_ENTRY_STASH_KEY, entry === "login" ? "auth" : entry);
    } catch { /* ignore */ }
  }

  if (flow === "wallet-otp") {
    try {
      sessionStorage.setItem(APP_FLOW_STASH_KEY, flow);
      localStorage.setItem(APP_FLOW_STASH_KEY, flow);
    } catch { /* ignore */ }
  }

  clearAppEntryFromUrl();
};
