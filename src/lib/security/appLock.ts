/** Idle app lock, PIN or passkey required after inactivity */

import { loadSecurityPrefs, hasAppPin, loadPasskeyCredential } from "./securityStore";
import { authenticatePlatformPasskey, isWebAuthnSupported } from "./webAuthn";

const LAST_ACTIVITY_KEY = "gp_last_activity";
const LOCKED_KEY = "gp_app_locked";

let listeners = new Set<(locked: boolean) => void>();

export const subscribeAppLock = (cb: (locked: boolean) => void) => {
  listeners.add(cb);
  cb(isAppLocked());
  return () => { listeners.delete(cb); };
};

const notify = () => {
  const locked = isAppLocked();
  listeners.forEach((cb) => cb(locked));
};

export const isAppLocked = (): boolean => sessionStorage.getItem(LOCKED_KEY) === "1";

export const lockApp = () => {
  sessionStorage.setItem(LOCKED_KEY, "1");
  notify();
};

export const unlockApp = () => {
  sessionStorage.removeItem(LOCKED_KEY);
  touchActivity();
  sessionStorage.setItem("gp_garuda_sign_unlocked_until", String(Date.now() + 5 * 60_000));
  notify();
};

export const touchActivity = () => {
  sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  if (isAppLocked()) return;
};

export const getIdleMs = (uid: string): number => {
  const prefs = loadSecurityPrefs(uid);
  const minutes = prefs.biometricEnabled || hasAppPin() ? prefs.appLockMinutes : 15;
  return minutes * 60_000;
};

export const checkIdleLock = (uid: string): boolean => {
  const prefs = loadSecurityPrefs(uid);
  if (!prefs.biometricEnabled && !hasAppPin()) return false;

  const last = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY) || Date.now());
  const idle = Date.now() - last;
  if (idle >= getIdleMs(uid)) {
    lockApp();
    return true;
  }
  return isAppLocked();
};

export const canUnlockWithPasskey = (uid: string): boolean =>
  isWebAuthnSupported() && Boolean(loadPasskeyCredential(uid));

export const unlockWithPasskey = async (uid: string): Promise<boolean> => {
  const cred = loadPasskeyCredential(uid);
  if (!cred) return false;
  const ok = await authenticatePlatformPasskey(cred);
  if (ok) unlockApp();
  return ok;
};

/** Wait until app lock cleared (e.g. user entered PIN on overlay). */
export const waitForAppUnlock = (timeoutMs = 90_000): Promise<boolean> =>
  new Promise((resolve) => {
    if (!isAppLocked()) {
      resolve(true);
      return;
    }
    const timer = window.setTimeout(() => {
      unsub();
      resolve(false);
    }, timeoutMs);
    const unsub = subscribeAppLock((locked) => {
      if (!locked) {
        window.clearTimeout(timer);
        unsub();
        resolve(true);
      }
    });
  });

export const startActivityWatcher = (uid: string | null) => {
  if (!uid) return () => {};
  const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
  const onActivity = () => {
    if (!isAppLocked()) touchActivity();
  };
  events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
  touchActivity();
  const interval = window.setInterval(() => {
    if (uid) checkIdleLock(uid);
  }, 30_000);
  return () => {
    events.forEach((e) => window.removeEventListener(e, onActivity));
    window.clearInterval(interval);
  };
};
