import type { TrustEthereumProvider } from "./trustWalletProvider";
import { createGarudaWalletProvider, type GarudaSignRequestFn } from "./garudaWalletProvider";
import { normalizeWalletAddress } from "./connectedWalletUtils";

export type GarudaNativeWalletType = "embedded:garuda";

type GarudaWalletEntry = {
  address: string;
  walletType: GarudaNativeWalletType;
  getProvider: () => Promise<TrustEthereumProvider>;
};

const garudaWallets = new Map<string, GarudaWalletEntry>();

export const GARUDA_NATIVE_PROVIDER: GarudaNativeWalletType = "embedded:garuda";

const canonicalGarudaAddress = (address: string): string => {
  try {
    return normalizeWalletAddress(address);
  } catch {
    return address.trim().toLowerCase();
  }
};

const storeGarudaEntry = (key: string, entry: GarudaWalletEntry) => {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return;
  garudaWallets.set(normalized, entry);
};

export const registerGarudaNativeWallet = (
  address: string,
  signRequest: GarudaSignRequestFn,
): void => {
  const canonical = canonicalGarudaAddress(address);
  const entry: GarudaWalletEntry = {
    address: canonical,
    walletType: GARUDA_NATIVE_PROVIDER,
    getProvider: async () => createGarudaWalletProvider(canonical, signRequest),
  };
  storeGarudaEntry(canonical, entry);
};

/** Map profile / linked address to the canonical Garuda native signer. */
export const linkGarudaNativeAlias = (alias: string, canonical: string): void => {
  const canonicalKey = canonicalGarudaAddress(canonical).toLowerCase();
  const entry = garudaWallets.get(canonicalKey);
  if (!entry) return;
  storeGarudaEntry(alias, entry);
};

/** Hapus alias signer, dipakai saat dompet utama diganti ke MetaMask/Trust. */
export const unlinkGarudaNativeAlias = (alias: string): void => {
  const key = alias.trim().toLowerCase();
  if (!key) return;
  const entry = garudaWallets.get(key);
  if (!entry) return;
  if (entry.address.toLowerCase() === key) return;
  garudaWallets.delete(key);
};

export const resolveGarudaNativeCanonicalAddress = (address: string): string | null =>
  garudaWallets.get(address.trim().toLowerCase())?.address ?? null;

export const clearGarudaNativeWallets = (): void => {
  garudaWallets.clear();
};

export const isGarudaNativeAddress = (address: string): boolean =>
  garudaWallets.has(address.trim().toLowerCase());

export const getGarudaNativeWalletType = (address: string): GarudaNativeWalletType | null =>
  garudaWallets.get(address.trim().toLowerCase())?.walletType ?? null;

export const getGarudaNativeEthereumProvider = async (
  from: string,
): Promise<TrustEthereumProvider | null> => {
  const entry = garudaWallets.get(from.trim().toLowerCase());
  if (!entry) return null;
  try {
    return await entry.getProvider();
  } catch {
    return null;
  }
};
