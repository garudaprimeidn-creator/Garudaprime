import type { Hex } from "viem";
import { secureGetAsync, secureRemove, secureSet } from "../security/secureStorage";
import { normalizeWalletAddress } from "../web3/connectedWalletUtils";

const PHRASE_WALLET_KEY = "phrase_wallet_v1";

type StoredPhraseWallet = {
  address: string;
  privateKey: Hex;
};

export async function savePhraseWalletSession(address: string, privateKey: Hex): Promise<void> {
  const checksum = normalizeWalletAddress(address);
  const payload: StoredPhraseWallet = { address: checksum, privateKey };
  secureSet(PHRASE_WALLET_KEY, JSON.stringify(payload));
}

export async function loadPhraseWalletSession(): Promise<StoredPhraseWallet | null> {
  const raw = await secureGetAsync(PHRASE_WALLET_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPhraseWallet;
    if (!parsed.address?.startsWith("0x") || !parsed.privateKey?.startsWith("0x")) return null;
    return {
      address: normalizeWalletAddress(parsed.address),
      privateKey: parsed.privateKey as Hex,
    };
  } catch {
    return null;
  }
}

export function clearPhraseWalletSession(): void {
  secureRemove(PHRASE_WALLET_KEY);
}
