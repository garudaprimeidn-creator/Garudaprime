import type { Hex } from "viem";
import type { TrustEthereumProvider } from "./trustWalletProvider";
import { createLocalPhraseWalletProvider } from "./localPhraseWalletProvider";
import { normalizeWalletAddress } from "./connectedWalletUtils";
import { loadPrimaryWalletLock, resolveAddressLockedProvider } from "./primaryWalletLock";
import { isPhraseWalletProvider, type WalletProvider } from "./walletService";
import {
  clearPhraseWalletSession,
  loadPhraseWalletSession,
  savePhraseWalletSession,
} from "../wallet/phraseWalletStore";

const phraseWallets = new Map<string, TrustEthereumProvider>();

export const PHRASE_WALLET_PROVIDER = "embedded:phrase" as const;

export function registerLocalPhraseWallet(address: string, privateKey: Hex): void {
  const key = normalizeWalletAddress(address).toLowerCase();
  phraseWallets.set(key, createLocalPhraseWalletProvider(normalizeWalletAddress(address), privateKey));
}

export function unregisterLocalPhraseWallet(address?: string): void {
  if (!address) {
    phraseWallets.clear();
    return;
  }
  phraseWallets.delete(normalizeWalletAddress(address).toLowerCase());
}

export function isPhraseWalletAddress(address: string): boolean {
  return phraseWallets.has(address.trim().toLowerCase());
}

export async function getLocalPhraseEthereumProvider(
  from: string,
): Promise<TrustEthereumProvider | null> {
  const key = from.trim().toLowerCase();
  const cached = phraseWallets.get(key);
  if (cached) return cached;

  const stored = await loadPhraseWalletSession();
  if (!stored) return null;

  registerLocalPhraseWallet(stored.address, stored.privateKey);
  const storedKey = stored.address.toLowerCase();
  return phraseWallets.get(storedKey === key ? key : storedKey) ?? null;
}

export async function persistAndRegisterPhraseWallet(
  address: string,
  privateKey: Hex,
): Promise<void> {
  await savePhraseWalletSession(address, privateKey);
  registerLocalPhraseWallet(address, privateKey);
}

export async function restorePhraseWalletSigner(): Promise<string | null> {
  const stored = await loadPhraseWalletSession();
  if (!stored) return null;
  registerLocalPhraseWallet(stored.address, stored.privateKey);
  return stored.address;
}

/** Pastikan signer frasa siap, cepat, tanpa API server (login / recovery). */
export async function ensurePhraseWalletReady(expectedAddress?: string): Promise<string | null> {
  const stored = await loadPhraseWalletSession();
  if (!stored) return null;
  registerLocalPhraseWallet(stored.address, stored.privateKey);
  if (expectedAddress) {
    const want = normalizeWalletAddress(expectedAddress).toLowerCase();
    if (stored.address.toLowerCase() !== want) {
      return stored.address;
    }
  }
  return stored.address;
}

/**
 * Gunakan signer frasa hanya jika transaksi memang untuk dompet frasa , 
 * jangan timpa dompet Web3 / Garuda Prime yang sedang aktif.
 */
export async function resolvePhraseSignerForTransaction(
  spendAddress: string,
  provider?: WalletProvider | null,
): Promise<string | null> {
  const stored = await loadPhraseWalletSession();
  if (!stored) return null;

  registerLocalPhraseWallet(stored.address, stored.privateKey);
  const spendKey = spendAddress.trim().toLowerCase();
  const storedKey = stored.address.toLowerCase();

  if (isPhraseWalletProvider(provider)) return stored.address;
  if (storedKey === spendKey || isPhraseWalletAddress(spendAddress)) return stored.address;

  const addrLock = resolveAddressLockedProvider(spendAddress);
  if (addrLock === PHRASE_WALLET_PROVIDER) return stored.address;

  const primaryLock = loadPrimaryWalletLock();
  if (primaryLock?.address.toLowerCase() === spendKey) {
    if (isPhraseWalletProvider(primaryLock.provider) || isPhraseWalletProvider(primaryLock.walletType)) {
      return stored.address;
    }
  }

  return null;
}

export function clearPhraseWalletSigner(): void {
  phraseWallets.clear();
  clearPhraseWalletSession();
}
