import type { UserProfile } from "../firebase/firestoreService";
import { normalizeWalletAddress } from "../web3/connectedWalletUtils";

const SETUP_DONE_PREFIX = "garuda_prime_account_setup_done_";
export const PENDING_AUTH_PHASE_KEY = "gp_pending_auth_phase";

const WALLET_AUTH_METHODS = new Set([
  "wallet",
  "metamask",
  "walletconnect",
  "trustwallet",
  "embedded:garuda",
  "embedded",
]);

export type PendingAuthPhase = "register" | "verify";

export type RegistrationSetupStep = "basic" | "region" | "wallet" | "kyc-intro" | "kyc" | "security";

const SETUP_STEP_KEY = "gp_registration_step";
const ACCOUNT_PREVIEW_KEY = "gp_account_preview";
const ACCOUNT_PREVIEW_LS_KEY = "gp_account_preview_ls";
const RESIDENCE_COUNTRY_KEY = "gp_residence_country";
const REGISTRATION_WALLET_KEY = "gp_registration_wallet";

export type AccountPreview = {
  uid: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
};

export const persistAccountPreview = (preview: AccountPreview) => {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ACCOUNT_PREVIEW_KEY, JSON.stringify(preview));
    localStorage.setItem(ACCOUNT_PREVIEW_LS_KEY, JSON.stringify(preview));
  } catch {
    /* quota */
  }
};

export const readAccountPreview = (uid?: string): AccountPreview | null => {
  if (typeof window === "undefined") return null;
  const parse = (raw: string | null): AccountPreview | null => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as AccountPreview;
      if (uid && parsed.uid !== uid) return null;
      return parsed;
    } catch {
      return null;
    }
  };
  return parse(sessionStorage.getItem(ACCOUNT_PREVIEW_KEY))
    ?? parse(localStorage.getItem(ACCOUNT_PREVIEW_LS_KEY));
};

export const clearAccountPreview = () => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ACCOUNT_PREVIEW_KEY);
  localStorage.removeItem(ACCOUNT_PREVIEW_LS_KEY);
};

export const isWalletAuthMethod = (method?: string | null) =>
  Boolean(method && WALLET_AUTH_METHODS.has(method.toLowerCase()));

export const markAccountSetupDone = (uid: string) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${SETUP_DONE_PREFIX}${uid}`, "1");
    clearPendingAuthPhase();
  } catch {
    /* quota */
  }
};

export const isAccountSetupDoneOnDevice = (uid: string) =>
  typeof window !== "undefined"
  && localStorage.getItem(`${SETUP_DONE_PREFIX}${uid}`) === "1";

export const persistPendingAuthPhase = (phase: PendingAuthPhase) => {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PENDING_AUTH_PHASE_KEY, phase);
};

export const readPendingAuthPhase = (): PendingAuthPhase | null => {
  if (typeof window === "undefined") return null;
  const value = sessionStorage.getItem(PENDING_AUTH_PHASE_KEY);
  if (value === "verify") return "register";
  return value === "register" ? value : null;
};

export const clearPendingAuthPhase = () => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PENDING_AUTH_PHASE_KEY);
  sessionStorage.removeItem(SETUP_STEP_KEY);
  try {
    localStorage.removeItem(SETUP_STEP_KEY);
  } catch {
    /* quota */
  }
  clearAccountPreview();
  clearResidenceCountry();
  clearRegistrationWallet();
};

const parseRegistrationStep = (value: string | null): RegistrationSetupStep | null =>
  value === "basic" || value === "region" || value === "wallet" || value === "kyc-intro" || value === "kyc" || value === "security"
    ? value
    : null;

export const persistRegistrationStep = (step: RegistrationSetupStep) => {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SETUP_STEP_KEY, step);
  try {
    localStorage.setItem(SETUP_STEP_KEY, step);
  } catch {
    /* quota */
  }
};

export const readRegistrationStep = (): RegistrationSetupStep | null => {
  if (typeof window === "undefined") return null;
  return parseRegistrationStep(sessionStorage.getItem(SETUP_STEP_KEY))
    ?? parseRegistrationStep(localStorage.getItem(SETUP_STEP_KEY));
};

export const persistResidenceCountry = (countryCode: string) => {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(RESIDENCE_COUNTRY_KEY, countryCode.toUpperCase());
  try {
    localStorage.setItem(RESIDENCE_COUNTRY_KEY, countryCode.toUpperCase());
  } catch {
    /* quota */
  }
};

export const readResidenceCountry = (): string | null => {
  if (typeof window === "undefined") return null;
  const fromSession = sessionStorage.getItem(RESIDENCE_COUNTRY_KEY);
  if (fromSession) return fromSession;
  try {
    return localStorage.getItem(RESIDENCE_COUNTRY_KEY);
  } catch {
    return null;
  }
};

export const clearResidenceCountry = () => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(RESIDENCE_COUNTRY_KEY);
  try {
    localStorage.removeItem(RESIDENCE_COUNTRY_KEY);
  } catch {
    /* quota */
  }
};

export const persistRegistrationWallet = (address: string) => {
  if (typeof window === "undefined") return;
  if (!address.trim()) {
    clearRegistrationWallet();
    return;
  }
  const normalized = address.trim();
  sessionStorage.setItem(REGISTRATION_WALLET_KEY, normalized);
  try {
    localStorage.setItem(REGISTRATION_WALLET_KEY, normalized);
  } catch {
    /* quota / private mode */
  }
};

export const readRegistrationWallet = (): string | null => {
  if (typeof window === "undefined") return null;
  const fromSession = sessionStorage.getItem(REGISTRATION_WALLET_KEY);
  if (fromSession?.trim()) return fromSession.trim();
  try {
    const fromLocal = localStorage.getItem(REGISTRATION_WALLET_KEY);
    if (fromLocal?.trim()) {
      sessionStorage.setItem(REGISTRATION_WALLET_KEY, fromLocal.trim());
      return fromLocal.trim();
    }
  } catch {
    /* ignore */
  }
  return null;
};

export const clearRegistrationWallet = () => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(REGISTRATION_WALLET_KEY);
  try {
    localStorage.removeItem(REGISTRATION_WALLET_KEY);
  } catch {
    /* ignore */
  }
};

/** True when user explicitly linked a wallet during the current registration/setup flow. */
export const hasRegistrationWalletLinked = (): boolean => {
  const addr = readRegistrationWallet()?.trim();
  return Boolean(addr && addr.startsWith("0x"));
};

/** Bootstrap registration wallet from session only when none is linked yet. */
export const syncRegistrationWalletFromSession = (
  address?: string | null,
): string | null => {
  const existing = readRegistrationWallet();
  if (existing?.startsWith("0x")) return existing;

  const candidate = address?.trim();
  if (!candidate?.startsWith("0x")) return null;

  const normalized = normalizeWalletAddress(candidate) || candidate;
  markRegistrationWalletLinked(normalized);
  return normalized;
};

export const markRegistrationWalletLinked = (address: string) => {
  const normalized = normalizeWalletAddress(address.trim()) || address.trim();
  persistRegistrationWallet(normalized);
};

export const clearRegistrationStep = () => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SETUP_STEP_KEY);
  try {
    localStorage.removeItem(SETUP_STEP_KEY);
  } catch {
    /* quota */
  }
};

/** Skip setup until user completes registration on this device (or wallet-only login). */
export const needsAccountSetup = (
  uid: string,
  profile: UserProfile | null,
  options?: { skipSetup?: boolean; authMethod?: string },
): boolean => {
  if (options?.skipSetup) return false;
  if (isAccountSetupDoneOnDevice(uid)) return false;

  const hasWallet = Boolean(profile?.walletAddress?.trim().startsWith("0x"));
  if (isWalletAuthMethod(options?.authMethod) && hasWallet) return false;

  return true;
};

export const resolveSessionPhase = (
  uid: string,
  profile: UserProfile | null,
  authUser?: { isDemo?: boolean; email?: string | null; emailVerified?: boolean } | null,
): PendingAuthPhase | "app" => {
  void authUser;
  if (needsAccountSetup(uid, profile)) return "register";
  return "app";
};
