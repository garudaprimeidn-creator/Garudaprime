/**
 * Per-user security preferences, local encrypted storage + Firestore sync flags.
 */

import { hashAppPin, verifyAppPinHash } from "./pinHash";
import { secureGet, secureSet, secureRemove, PIN_KEY } from "./secureStorage";
import { updateUserProfile } from "../firebase/firestoreService";

const sk = (uid: string, key: string) => `${uid}::${key}`;

export const MFA_VERIFIED_KEY = "gp_mfa_verified";
export const MFA_PENDING_KEY = "gp_mfa_pending";

export type SecurityPrefs = {
  twoFactorEnabled: boolean;
  biometricEnabled: boolean;
  strictDeviceLock: boolean;
  appLockMinutes: number;
};

const DEFAULT_PREFS: SecurityPrefs = {
  twoFactorEnabled: false,
  biometricEnabled: false,
  strictDeviceLock: true,
  appLockMinutes: 5,
};

export const loadSecurityPrefs = (uid: string): SecurityPrefs => ({
  twoFactorEnabled: secureGet(sk(uid, "2fa_enabled")) === "1",
  biometricEnabled: secureGet(sk(uid, "bio_enabled")) === "1",
  strictDeviceLock: secureGet(sk(uid, "strict_device")) !== "0",
  appLockMinutes: Number(secureGet(sk(uid, "app_lock_min")) || 5),
});

export const saveTotpSecret = (uid: string, secret: string) => {
  secureSet(sk(uid, "totp_secret"), secret);
};

export const loadTotpSecret = (uid: string): string | null =>
  secureGet(sk(uid, "totp_secret"));

export const clearTotpSecret = (uid: string) => {
  secureRemove(sk(uid, "totp_secret"));
  secureSet(sk(uid, "2fa_enabled"), "0");
};

export const savePasskeyCredential = (uid: string, credentialIdB64: string) => {
  secureSet(sk(uid, "webauthn_cred"), credentialIdB64);
};

export const loadPasskeyCredential = (uid: string): string | null =>
  secureGet(sk(uid, "webauthn_cred"));

export const clearPasskeyCredential = (uid: string) => {
  secureRemove(sk(uid, "webauthn_cred"));
  secureSet(sk(uid, "bio_enabled"), "0");
};

export const hasAppPin = (): boolean => {
  if (secureGet(PIN_KEY)) return true;
  try {
    return Boolean(localStorage.getItem(`gp_secure_${PIN_KEY}`));
  } catch {
    return false;
  }
};

/** True when at least one verification method is configured and usable. */
export const hasActiveSecurityChallenge = (uid: string): boolean => {
  const prefs = loadSecurityPrefs(uid);
  if (prefs.twoFactorEnabled && loadTotpSecret(uid)) return true;
  if (prefs.biometricEnabled && loadPasskeyCredential(uid)) return true;
  if (hasAppPin()) return true;
  return false;
};

export const setAppPin = async (pin: string) => {
  secureSet(PIN_KEY, await hashAppPin(pin));
};

export const verifyAppPin = (pin: string): boolean => {
  const stored = secureGet(PIN_KEY);
  if (!stored) return false;
  if (!stored.startsWith("pbkdf2$")) return stored === pin;
  return false;
};

export const verifyAppPinAsync = async (pin: string): Promise<boolean> => {
  const stored = secureGet(PIN_KEY);
  return verifyAppPinHash(pin, stored ?? "");
};

export const syncSecurityPrefsToFirestore = async (uid: string, prefs: Partial<SecurityPrefs>) => {
  try {
    await updateUserProfile(uid, {
      ...(prefs.twoFactorEnabled !== undefined ? { twoFactorEnabled: prefs.twoFactorEnabled } : {}),
      ...(prefs.biometricEnabled !== undefined ? { biometricEnabled: prefs.biometricEnabled } : {}),
      ...(prefs.strictDeviceLock !== undefined ? { securityStrictMode: prefs.strictDeviceLock } : {}),
    });
  } catch { /* optional sync */ }
};

export const applyProfileSecurityFlags = (
  uid: string,
  profile?: { twoFactorEnabled?: boolean; biometricEnabled?: boolean; securityStrictMode?: boolean } | null,
): SecurityPrefs => {
  const local = loadSecurityPrefs(uid);
  if (!profile) return local;
  if (profile.twoFactorEnabled && !local.twoFactorEnabled && loadTotpSecret(uid)) {
    secureSet(sk(uid, "2fa_enabled"), "1");
  }
  if (profile.biometricEnabled && !local.biometricEnabled && loadPasskeyCredential(uid)) {
    secureSet(sk(uid, "bio_enabled"), "1");
  }
  if (profile.securityStrictMode === false) {
    secureSet(sk(uid, "strict_device"), "0");
  }
  return loadSecurityPrefs(uid);
};

export const setTwoFactorEnabledLocal = (uid: string, enabled: boolean) => {
  secureSet(sk(uid, "2fa_enabled"), enabled ? "1" : "0");
  if (!enabled) clearTotpSecret(uid);
};

export const setBiometricEnabledLocal = (uid: string, enabled: boolean) => {
  secureSet(sk(uid, "bio_enabled"), enabled ? "1" : "0");
  if (!enabled) clearPasskeyCredential(uid);
};

export const setStrictDeviceLock = (uid: string, strict: boolean) => {
  secureSet(sk(uid, "strict_device"), strict ? "1" : "0");
};

export const isMfaVerifiedThisSession = (): boolean =>
  sessionStorage.getItem(MFA_VERIFIED_KEY) === "1";

export const markMfaVerified = () => {
  sessionStorage.setItem(MFA_VERIFIED_KEY, "1");
  sessionStorage.removeItem(MFA_PENDING_KEY);
};

export const markMfaPending = () => {
  sessionStorage.setItem(MFA_PENDING_KEY, "1");
  sessionStorage.removeItem(MFA_VERIFIED_KEY);
};

export const clearMfaSession = () => {
  sessionStorage.removeItem(MFA_VERIFIED_KEY);
  sessionStorage.removeItem(MFA_PENDING_KEY);
};

export const needsMfaChallenge = (uid: string): boolean => {
  const prefs = loadSecurityPrefs(uid);
  return prefs.twoFactorEnabled
    && Boolean(loadTotpSecret(uid))
    && !isMfaVerifiedThisSession();
};

/** Clear security flags that were toggled without completing setup (e.g. registration checkbox). */
export const sanitizeSecurityPrefs = (uid: string): SecurityPrefs => {
  const prefs = loadSecurityPrefs(uid);
  if (prefs.twoFactorEnabled && !loadTotpSecret(uid)) {
    setTwoFactorEnabledLocal(uid, false);
  }
  if (prefs.biometricEnabled && !loadPasskeyCredential(uid)) {
    setBiometricEnabledLocal(uid, false);
  }
  return loadSecurityPrefs(uid);
};

export { DEFAULT_PREFS };
