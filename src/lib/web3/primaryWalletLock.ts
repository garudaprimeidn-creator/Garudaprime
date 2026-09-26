import { getAddress, isAddress } from "viem";
import type { ConnectedWalletDoc } from "../firebase/firestoreService";
import type { WalletProvider } from "./walletService";

const normalizeAddr = (address: string): string => {
  const trimmed = address.trim();
  if (!trimmed) return "";
  try {
    if (!isAddress(trimmed, { strict: false })) return trimmed.toLowerCase();
    return getAddress(trimmed);
  } catch {
    return trimmed.toLowerCase();
  }
};

const LOCK_KEY = "gp_primary_wallet_lock";
const ADDR_LOCKS_KEY = "gp_wallet_provider_locks";

type AddressProviderLocks = Record<string, { provider: WalletProvider; walletType: string; lockedAt: number }>;

export type PrimaryWalletLock = {
  address: string;
  provider: WalletProvider;
  walletType: string;
  lockedAt: number;
};

const readAddressLocks = (): AddressProviderLocks => {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(ADDR_LOCKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AddressProviderLocks;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeAddressLocks = (locks: AddressProviderLocks): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ADDR_LOCKS_KEY, JSON.stringify(locks));
  } catch {
    /* private mode */
  }
};

const isGarudaWalletType = (walletType: string): boolean => {
  const t = walletType.trim().toLowerCase();
  return t === "embedded:garuda" || t.includes("embedded:privy") || t === "embedded";
};

const isExternalWalletType = (walletType: string, provider: WalletProvider): boolean => {
  const t = walletType.trim().toLowerCase();
  return (
    t === "metamask"
    || t === "trustwallet"
    || t === "walletconnect"
    || t === "embedded:external"
    || provider === "metamask"
    || provider === "trustwallet"
    || provider === "walletconnect"
    || provider === "embedded:external"
  );
};

/** Kunci provider per alamat, tidak berubah meski sesi global berganti. */
export const saveAddressProviderLock = (
  address: string,
  provider: WalletProvider,
  walletType: string,
  options?: { force?: boolean },
): void => {
  const key = normalizeAddr(address).toLowerCase();
  if (!key.startsWith("0x")) return;
  const locks = readAddressLocks();
  const existing = locks[key];
  const nextType = walletType.trim() || provider;
  const isGaruda = isGarudaWalletType(nextType) || provider === "embedded:garuda";
  const isExternal = isExternalWalletType(nextType, provider);

  if (
    !options?.force
    && existing
    && (existing.walletType === "embedded:garuda" || existing.provider === "embedded:garuda")
    && isExternal
  ) {
    locks[key] = {
      provider,
      walletType: nextType,
      lockedAt: Date.now(),
    };
    writeAddressLocks(locks);
    return;
  }

  if (
    !options?.force
    && existing
    && (existing.walletType === "embedded:garuda" || existing.provider === "embedded:garuda")
    && !isGaruda
  ) {
    return;
  }

  locks[key] = {
    provider: isGaruda ? "embedded:garuda" : provider,
    walletType: isGaruda ? "embedded:garuda" : nextType,
    lockedAt: Date.now(),
  };
  writeAddressLocks(locks);
};

export const resolveAddressLockedProvider = (address: string): WalletProvider | null => {
  const key = address.trim().toLowerCase();
  if (!key.startsWith("0x")) return null;
  return readAddressLocks()[key]?.provider ?? null;
};

export const clearAddressProviderLock = (address: string): void => {
  const key = address.trim().toLowerCase();
  if (!key.startsWith("0x")) return;
  const locks = readAddressLocks();
  if (!locks[key]) return;
  delete locks[key];
  writeAddressLocks(locks);
};

export const clearAllAddressProviderLocks = (): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(ADDR_LOCKS_KEY);
  } catch {
    /* ignore */
  }
};

export const savePrimaryWalletLock = (lock: PrimaryWalletLock): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(lock));
    saveAddressProviderLock(lock.address, lock.provider, lock.walletType);
  } catch {
    /* private mode */
  }
};

export const loadPrimaryWalletLock = (): PrimaryWalletLock | null => {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PrimaryWalletLock;
    if (!parsed?.address?.startsWith("0x") || parsed.address.trim().length < 10) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearPrimaryWalletLock = (): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(LOCK_KEY);
  } catch {
    /* ignore */
  }
};

export const clearAllWalletProviderLocks = (): void => {
  clearPrimaryWalletLock();
  clearAllAddressProviderLocks();
};

export const primaryWalletLockForRow = (
  row: ConnectedWalletDoc,
  provider: WalletProvider,
): PrimaryWalletLock => ({
  address: normalizeAddr(row.walletAddress),
  provider,
  walletType: row.walletType?.trim() || provider,
  lockedAt: Date.now(),
});

export const resolveProviderFromPrimaryLock = (address: string): WalletProvider | null => {
  const lock = loadPrimaryWalletLock();
  if (!lock) return null;
  if (lock.address.toLowerCase() !== address.trim().toLowerCase()) return null;
  return lock.provider;
};
