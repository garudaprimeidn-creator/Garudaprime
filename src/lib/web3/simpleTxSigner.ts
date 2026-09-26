/**
 * Resolusi dompet untuk kirim/bayar, satu jalur jelas:
 * Garuda Prime OTP → embedded (tanpa WalletConnect)
 * Frasa BIP39 → lokal
 * MetaMask / Trust / WC → web3
 */
import { loadPrimaryWalletLock } from "./primaryWalletLock";
import {
  normalizeWalletAddress,
  resolveGarudaServerSignerAddress,
  resolveOnChainBalanceAddress,
  resolveTransactionWalletProvider,
} from "./connectedWalletUtils";
import { cacheGarudaServerAddress, getCachedGarudaServerAddress } from "./garudaNativeSession";
import {
  ensureGarudaNativeSigningReady,
  fetchExistingGarudaWalletAddress,
} from "./garudaNativeProvision";
import { getGarudaNativeEthereumProvider } from "./garudaWalletBridge";
import { grantGarudaSignWindow } from "./garudaWalletSignGate";
import { withWalletTimeout } from "./walletTimeout";
import { resolvePhraseSignerForTransaction } from "./phraseWalletBridge";
import {
  isGarudaNativeWalletType,
  isPhraseWalletProvider,
  type ConnectedWallet,
  type WalletProvider,
} from "./walletService";
import type { TrustEthereumProvider } from "./trustWalletProvider";
import { PHRASE_WALLET_PROVIDER } from "./phraseWalletBridge";

export type SimpleSpendContext = {
  address: string;
  provider: WalletProvider;
};

export function resolveSimpleSpendWallet(options: {
  profileAddress?: string | null;
  connectedWallet?: ConnectedWallet | null;
  fallbackAddress?: string | null;
}): SimpleSpendContext {
  const lock = loadPrimaryWalletLock();
  const connected = options.connectedWallet;

  if (lock && isPhraseWalletProvider(lock.provider)) {
    try {
      return { address: normalizeWalletAddress(lock.address), provider: PHRASE_WALLET_PROVIDER };
    } catch {
      return { address: lock.address.trim(), provider: PHRASE_WALLET_PROVIDER };
    }
  }

  const address = resolveOnChainBalanceAddress(options);
  const provider = resolveTransactionWalletProvider(address, connected);

  if (provider === "embedded:garuda" || isGarudaNativeWalletType(provider)) {
    const server = resolveGarudaServerSignerAddress();
    if (server) {
      try {
        return { address: normalizeWalletAddress(server), provider: "embedded:garuda" };
      } catch {
        return { address: server, provider: "embedded:garuda" };
      }
    }
  }

  return { address, provider };
}

/** Siapkan penandatangan Garuda Prime, tanpa WalletConnect. */
export async function prepareGarudaSigner(
  uid: string,
  hintAddress?: string | null,
): Promise<string> {
  grantGarudaSignWindow();

  let server = getCachedGarudaServerAddress();
  if (!server) {
    server = await fetchExistingGarudaWalletAddress(uid).catch(() => null);
    if (server) cacheGarudaServerAddress(server);
  }

  const active = await withWalletTimeout(
    ensureGarudaNativeSigningReady(uid, server ?? hintAddress ?? undefined),
    12_000,
    "Dompet Garuda Prime tidak merespons, tutup lalu buka lagi aplikasi",
    "embedded/timeout",
  );

  const eth = await getGarudaNativeEthereumProvider(active);
  if (!eth) {
    throw Object.assign(
      new Error("Dompet Garuda Prime belum siap, tunggu beberapa detik lalu coba lagi"),
      { code: "embedded/not-ready" },
    );
  }

  return active;
}

/** Alamat + provider siap transaksi (async hanya untuk frasa / prefetch Garuda). */
export async function resolveSimpleTxSigner(
  options: {
    profileAddress?: string | null;
    connectedWallet?: ConnectedWallet | null;
    fallbackAddress?: string | null;
    uid?: string | null;
  },
): Promise<SimpleSpendContext> {
  const base = resolveSimpleSpendWallet(options);

  const phraseAddr = await resolvePhraseSignerForTransaction(base.address, base.provider);
  if (phraseAddr) {
    return { address: phraseAddr, provider: PHRASE_WALLET_PROVIDER };
  }

  if (isGarudaNativeWalletType(base.provider) && options.uid) {
    const active = await prepareGarudaSigner(options.uid, base.address);
    try {
      return { address: normalizeWalletAddress(active), provider: "embedded:garuda" };
    } catch {
      return { address: active, provider: "embedded:garuda" };
    }
  }

  return base;
}

export async function getGarudaSignerProvider(
  uid: string,
  address: string,
): Promise<TrustEthereumProvider> {
  const active = await prepareGarudaSigner(uid, address);
  const eth = await getGarudaNativeEthereumProvider(active);
  if (!eth) {
    throw Object.assign(new Error("Dompet Garuda Prime belum siap"), { code: "embedded/not-ready" });
  }
  return eth;
}
