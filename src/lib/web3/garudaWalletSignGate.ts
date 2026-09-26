/**
 * Client gate before Garuda native wallet sign, reuses app lock / PIN / biometrik (no new UI).
 */
import { isAppLocked, unlockApp } from "../security/appLock";
import { hasActiveSecurityChallenge } from "../security/securityStore";
import { buildDeviceId } from "../auth/deviceSessions";
import { getDeviceInfo } from "../auth/deviceInfo";
import { requestGarudaSignChallenge } from "./garudaWalletApi";
import { cacheGarudaServerAddress } from "./garudaNativeSession";
import { normalizeWalletAddress } from "./connectedWalletUtils";

const SIGN_UNLOCK_KEY = "gp_garuda_sign_unlocked_until";
const SIGN_WINDOW_MS = 5 * 60_000;

export function grantGarudaSignWindow(ms = SIGN_WINDOW_MS): void {
  sessionStorage.setItem(SIGN_UNLOCK_KEY, String(Date.now() + ms));
}

export function isGarudaSignWindowActive(): boolean {
  const until = Number(sessionStorage.getItem(SIGN_UNLOCK_KEY) || 0);
  return Date.now() < until;
}

export function canSignWithGarudaWallet(uid: string): boolean {
  if (isAppLocked()) return false;
  if (!hasActiveSecurityChallenge(uid)) return true;
  if (!isGarudaSignWindowActive()) grantGarudaSignWindow();
  return true;
}

export function garudaDeviceId(): string {
  const { device, browser } = getDeviceInfo();
  return buildDeviceId(device, browser);
}

/** Obtain short-lived server sign token; throws if app lock active. */
export async function obtainGarudaSignToken(
  idToken: string,
  address: string,
  uid: string,
): Promise<string | undefined> {
  if (!canSignWithGarudaWallet(uid)) {
    throw Object.assign(new Error("Buka kunci aplikasi terlebih dahulu"), { code: "garuda/app-locked" });
  }

  const requireChallenge = import.meta.env.VITE_GARUDA_SIGN_CHALLENGE !== "false";
  if (!requireChallenge && !hasActiveSecurityChallenge(uid)) {
    return undefined;
  }

  const { signToken, address: serverAddr } = await requestGarudaSignChallenge(
    idToken,
    address,
    garudaDeviceId(),
  );
  if (serverAddr?.startsWith("0x")) {
    cacheGarudaServerAddress(normalizeWalletAddress(serverAddr));
  }
  return signToken;
}

export function onAppUnlockedGrantSign(): void {
  grantGarudaSignWindow();
}
