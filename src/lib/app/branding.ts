import {
  DEFAULT_APP_ORIGIN,
  DEFAULT_OFFICIAL_WEB_URL,
  DOMAIN_ROOT,
} from "./domains";

/** Official Garuda Prime marketing site */
export const OFFICIAL_WEB_URL =
  import.meta.env.VITE_OFFICIAL_WEB_URL?.replace(/\/+$/, "") || DEFAULT_OFFICIAL_WEB_URL;

export const APP_NAME = "Garuda Prime";

/** Header tagline under app name */
export const APP_TAGLINE = "One Platform. Prime Solutions";

/** Shorter tagline for narrow mobile header */
export const APP_TAGLINE_SHORT = "One Platform · Prime";

/** Hostname shown in header chrome (no protocol) */
export const OFFICIAL_WEB_DOMAIN = (() => {
  try {
    return new URL(OFFICIAL_WEB_URL).hostname.replace(/^www\./, "");
  } catch {
    return DOMAIN_ROOT;
  }
})();

/** Deployed app origin (WalletConnect, OAuth callbacks, metadata) */
export const APP_ORIGIN = (() => {
  if (typeof window !== "undefined") return window.location.origin;
  const fromEnv = import.meta.env.VITE_APP_ORIGIN?.replace(/\/+$/, "");
  return fromEnv || DEFAULT_APP_ORIGIN;
})();

export const FAVICON_PATH = "/favicon-32.png";

/** 512px app icon, WalletConnect, PWA */
export const APP_ICON_PATH = "/icon-512.png";
export const APP_ICON_PATH_2X = "/icon-1024.png";

export const faviconUrl = (origin = APP_ORIGIN) => `${origin}${APP_ICON_PATH}`;

/** Legal pages, hosted on the app deployment (app.garudaprime.id), not marketing root */
export const PRIVACY_POLICY_URL = "/privacy/";
export const TERMS_OF_SERVICE_URL = "/terms/";
