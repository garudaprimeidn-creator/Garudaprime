/** OAuth popup + callback bridge for KYCPORT SSO */

import {
  getKycPortOAuthCallbackParams,
  isKycPortCallbackPath,
  KYCPORT_CALLBACK_PATH,
} from "./kycportCallbackParams";

export { KYCPORT_CALLBACK_PATH };
export const KYCPORT_RESUME_PATH = "/auth/kycport/resume";
export const KYCPORT_OAUTH_MESSAGE = "garuda:kycport-oauth";
export const KYCPORT_AWAITING_KEY = "gp_kycport_awaiting";
/** One-shot full-page OAuth redirect when popup closes without callback */
export const KYCPORT_REDIRECT_FALLBACK_KEY = "gp_kycport_redirect_fallback";

export const clearKycPortRedirectFallback = () => {
  sessionStorage.removeItem(KYCPORT_REDIRECT_FALLBACK_KEY);
};

export type KycPortOAuthMessage = {
  type: typeof KYCPORT_OAUTH_MESSAGE;
  code?: string | null;
  state?: string | null;
  error?: string | null;
  error_description?: string | null;
};

export const getKycPortCallbackUri = (): string => {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${KYCPORT_CALLBACK_PATH}`;
};

export {
  getKycPortOAuthCallbackParams,
  hasKycPortOAuthCallbackParams,
  preserveKycPortCallbackSnapshot,
} from "./kycportCallbackParams";

export { isKycPortCallbackPath } from "./kycportCallbackParams";

export const isKycPortResumePath = () =>
  typeof window !== "undefined" && window.location.pathname === KYCPORT_RESUME_PATH;

export const setKycPortAwaiting = (value: boolean) => {
  if (value) sessionStorage.setItem(KYCPORT_AWAITING_KEY, "1");
  else sessionStorage.removeItem(KYCPORT_AWAITING_KEY);
};

export const isKycPortAwaiting = () =>
  sessionStorage.getItem(KYCPORT_AWAITING_KEY) === "1";

/** Origins allowed for popup ↔ opener OAuth postMessage. */
export const resolveKycPortPostMessageOrigins = (): Set<string> => {
  const origins = new Set<string>();
  if (typeof window === "undefined") return origins;

  origins.add(window.location.origin);

  try {
    const fromEnv = import.meta.env.VITE_KYCPORT_REDIRECT_URI?.trim();
    if (fromEnv) origins.add(new URL(fromEnv).origin);
    else origins.add(new URL(getKycPortCallbackUri()).origin);
  } catch { /* ignore */ }

  try {
    if (window.opener && !window.opener.closed) {
      origins.add(window.opener.location.origin);
    }
  } catch { /* cross-origin opener */ }

  return origins;
};

export const isAllowedKycPortPostMessageOrigin = (origin: string): boolean =>
  resolveKycPortPostMessageOrigins().has(origin);

const postKycPortOAuthToOpener = (payload: KycPortOAuthMessage): boolean => {
  if (!window.opener || window.opener.closed) return false;

  const origins = resolveKycPortPostMessageOrigins();
  let delivered = false;
  for (const origin of origins) {
    try {
      window.opener.postMessage(payload, origin);
      delivered = true;
    } catch { /* try next origin */ }
  }
  return delivered;
};

/** Popup callback page, forward OAuth params to opener and close. */
export const runKycPortCallbackBridge = (): boolean => {
  if (!isKycPortCallbackPath()) return false;

  const params = getKycPortOAuthCallbackParams();
  const payload: KycPortOAuthMessage = {
    type: KYCPORT_OAUTH_MESSAGE,
    code: params.get("code"),
    state: params.get("state"),
    error: params.get("error"),
    error_description: params.get("error_description"),
  };

  if (postKycPortOAuthToOpener(payload)) {
    window.setTimeout(() => {
      try {
        window.close();
      } catch { /* ignore */ }
    }, 80);
    return true;
  }
  return false;
};

export const openKycPortOAuthPopup = (url: string): Window | null => {
  const features = "popup=yes,width=520,height=720,left=80,top=40";
  return window.open(url, "garuda_kycport_oauth", features);
};

export const listenKycPortOAuthPopup = (
  onMessage: (msg: KycPortOAuthMessage) => void,
): (() => void) => {
  const handler = (event: MessageEvent) => {
    if (!isAllowedKycPortPostMessageOrigin(event.origin)) return;
    const data = event.data as KycPortOAuthMessage;
    if (data?.type !== KYCPORT_OAUTH_MESSAGE) return;
    onMessage(data);
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
};

export const cleanKycPortOAuthPath = () => {
  if (typeof window === "undefined") return;
  if (!isKycPortCallbackPath() && !isKycPortResumePath()) return;
  window.history.replaceState({}, "", "/");
};
