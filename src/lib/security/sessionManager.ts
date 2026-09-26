/**
 * Session handling, Firebase ID token + device fingerprint + CSRF token.
 * Session survives page refresh until explicit sign-out.
 */

import { auth, isFirebaseConfigured } from "../firebase/config";
import {
  secureGet,
  secureGetAsync,
  secureSet,
  secureRemove,
  hydrateSessionKeys,
  SESSION_KEY,
  REMEMBER_KEY,
  PLAIN_UID_KEY,
} from "./secureStorage";
import { loadSecurityPrefs } from "./securityStore";

const CSRF_KEY = "csrf_token";
const FINGERPRINT_KEY = "session_fp";
const TOKEN_EXP_KEY = "token_exp";

const deviceFingerprint = (): string => {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
  return btoa(parts.join("|")).slice(0, 48);
};

export const initCsrfToken = (): string => {
  let token = sessionStorage.getItem(CSRF_KEY);
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem(CSRF_KEY, token);
  }
  return token;
};

export const validateCsrfToken = (token: string | null | undefined): boolean => {
  if (!token) return false;
  return token === sessionStorage.getItem(CSRF_KEY);
};

export const getCsrfToken = () => sessionStorage.getItem(CSRF_KEY);

/** Attach CSRF header for state-changing API calls */
export const csrfHeaders = (): Record<string, string> => {
  const token = getCsrfToken();
  return token ? { "X-CSRF-Token": token } : {};
};

export type SessionPayload = {
  uid: string;
  fingerprint: string;
  tokenExp: number;
  remember: boolean;
};

export type SessionCheck = {
  valid: boolean;
  uid: string | null;
  reason?: "no_session" | "no_uid" | "fingerprint_mismatch" | "token_expired";
};

/** Sync uid read, plain backup avoids async decrypt race on refresh */
export const getSessionUidSync = (): string | null =>
  secureGet("uid") ?? localStorage.getItem(PLAIN_UID_KEY);

/** Async uid read with encrypted + plain fallbacks */
export const getSessionUidAsync = async (): Promise<string | null> => {
  const cached = secureGet("uid");
  if (cached) return cached;
  const plain = localStorage.getItem(PLAIN_UID_KEY);
  if (plain) return plain;
  return secureGetAsync("uid");
};

/** Warm session cache then validate, use on boot when sync uid is missing */
export const validateSessionAsync = async (): Promise<SessionCheck> => {
  if (getSessionUidSync()) return validateSession();
  await hydrateSessionKeys();
  return validateSession();
};

export const establishSession = async (uid: string, remember = true): Promise<void> => {
  initCsrfToken();
  const fingerprint = deviceFingerprint();
  localStorage.setItem(PLAIN_UID_KEY, uid);
  secureSet(FINGERPRINT_KEY, fingerprint);

  let tokenExp = Date.now() + 3600_000;
  if (isFirebaseConfigured && auth?.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      const payload = JSON.parse(atob(token.split(".")[1] ?? "{}")) as { exp?: number };
      if (payload.exp) tokenExp = payload.exp * 1000;
      secureSet("id_token", token);
    } catch { /* demo / wallet auth */ }
  }

  secureSet(TOKEN_EXP_KEY, String(tokenExp));
  secureSet("uid", uid);
  localStorage.setItem(SESSION_KEY, "1");
  if (remember) localStorage.setItem(REMEMBER_KEY, "1");
};

export const validateSession = (): SessionCheck => {
  if (localStorage.getItem(SESSION_KEY) !== "1") {
    return { valid: false, uid: null, reason: "no_session" };
  }

  const uid = getSessionUidSync();
  if (!uid) return { valid: false, uid: null, reason: "no_uid" };

  const storedFp = secureGet(FINGERPRINT_KEY);
  const currentFp = deviceFingerprint();
  if (storedFp && storedFp !== currentFp) {
    const strict = loadSecurityPrefs(uid).strictDeviceLock;
    if (strict) {
      return { valid: false, uid, reason: "fingerprint_mismatch" };
    }
    rebindDeviceFingerprint();
  }

  const expRaw = secureGet(TOKEN_EXP_KEY);
  if (expRaw && Number(expRaw) < Date.now()) {
    return { valid: false, uid, reason: "token_expired" };
  }

  return { valid: true, uid };
};

/** Re-bind fingerprint after viewport/orientation changes, never sign out for this alone */
export const rebindDeviceFingerprint = (): void => {
  secureSet(FINGERPRINT_KEY, deviceFingerprint());
};

export const refreshSessionToken = async (): Promise<boolean> => {
  if (!isFirebaseConfigured || !auth?.currentUser) return false;
  try {
    const token = await auth.currentUser.getIdToken(true);
    const payload = JSON.parse(atob(token.split(".")[1] ?? "{}")) as { exp?: number };
    secureSet("id_token", token);
    if (payload.exp) secureSet(TOKEN_EXP_KEY, String(payload.exp * 1000));
    return true;
  } catch {
    return false;
  }
};

export const getStoredIdToken = (): string | null => secureGet("id_token");

export const destroySession = () => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  localStorage.removeItem(PLAIN_UID_KEY);
  secureRemove("uid");
  secureRemove(FINGERPRINT_KEY);
  secureRemove(TOKEN_EXP_KEY);
  secureRemove("id_token");
  sessionStorage.removeItem(CSRF_KEY);
};

export const getSessionMeta = (): SessionPayload | null => {
  const check = validateSession();
  if (!check.valid || !check.uid) return null;
  return {
    uid: check.uid,
    fingerprint: secureGet(FINGERPRINT_KEY) ?? deviceFingerprint(),
    tokenExp: Number(secureGet(TOKEN_EXP_KEY) ?? 0),
    remember: localStorage.getItem(REMEMBER_KEY) === "1",
  };
};
