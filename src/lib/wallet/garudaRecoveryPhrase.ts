import {
  entropyToMnemonic,
  mnemonicToEntropy,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { sha256 } from "@noble/hashes/sha256";
import type { Hex } from "viem";
import { toHex } from "viem";
import {
  mnemonicToAccount,
  privateKeyToAccount,
  type HDAccount,
  type PrivateKeyAccount,
} from "viem/accounts";
import { getAddress, isAddress } from "viem";

export type GarudaPhraseLength = 12 | 24;

/** MetaMask / Trust Wallet / Ledger default first Ethereum account. */
export const STANDARD_ETH_DERIVATION_PATH = "m/44'/60'/0'/0/0" as const;

export type RecoveryDerivation = "standard" | "legacy";

export function normalizeRecoveryPhrase(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function splitRecoveryPhraseWords(phrase: string): string[] {
  return normalizeRecoveryPhrase(phrase).split(" ").filter(Boolean);
}

export function phraseWordCount(phrase: string): GarudaPhraseLength | null {
  const count = splitRecoveryPhraseWords(phrase).length;
  if (count === 12 || count === 24) return count;
  return null;
}

export function isValidGarudaRecoveryPhrase(phrase: string): boolean {
  const normalized = normalizeRecoveryPhrase(phrase);
  if (!normalized) return false;
  const count = phraseWordCount(normalized);
  if (!count) return false;
  return validateMnemonic(normalized, wordlist);
}

/** Generate a standard BIP39 mnemonic (12 or 24 words), importable in MetaMask & other wallets. */
export function generateGarudaRecoveryPhrase(wordCount: GarudaPhraseLength = 24): string {
  const entropy = new Uint8Array(wordCount === 12 ? 16 : 32);
  crypto.getRandomValues(entropy);
  return entropyToMnemonic(entropy, wordlist);
}

/** @deprecated Pre-BIP44 Garuda scheme, entropy bytes used directly as private key material. */
function legacyEntropyToPrivateKeyHex(entropy: Uint8Array): Hex {
  if (entropy.length === 32) {
    const hex = Array.from(entropy, (b) => b.toString(16).padStart(2, "0")).join("");
    return `0x${hex}` as Hex;
  }
  if (entropy.length === 16) {
    const digest = sha256(entropy);
    const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
    return `0x${hex}` as Hex;
  }
  throw new Error("Invalid recovery phrase length");
}

/** Legacy Garuda derivation (not MetaMask-compatible). */
export function recoveryPhraseToPrivateKeyLegacy(phrase: string): Hex {
  const normalized = normalizeRecoveryPhrase(phrase);
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("Invalid recovery phrase");
  }
  const entropy = mnemonicToEntropy(normalized, wordlist);
  if (entropy.length !== 32 && entropy.length !== 16) {
    throw new Error("Invalid recovery phrase length");
  }
  return legacyEntropyToPrivateKeyHex(entropy);
}

export function recoveryPhraseToAddressLegacy(phrase: string): string {
  const account = privateKeyToAccount(recoveryPhraseToPrivateKeyLegacy(phrase));
  return account.address.toLowerCase();
}

/** Standard BIP44 Ethereum account, same address as MetaMask account #1. */
export function recoveryPhraseToPrivateKeyStandard(phrase: string): Hex {
  const normalized = normalizeRecoveryPhrase(phrase);
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("Invalid recovery phrase");
  }
  const account = mnemonicToAccount(normalized, { path: STANDARD_ETH_DERIVATION_PATH });
  const pk = account.getHdKey().privateKey;
  if (!pk) throw new Error("Failed to derive private key");
  return toHex(pk);
}

export function recoveryPhraseToAddressStandard(phrase: string): string {
  const normalized = normalizeRecoveryPhrase(phrase);
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("Invalid recovery phrase");
  }
  return mnemonicToAccount(normalized, { path: STANDARD_ETH_DERIVATION_PATH }).address.toLowerCase();
}

export function recoveryPhraseToAddress(
  phrase: string,
  derivation: RecoveryDerivation = "standard",
): string {
  return derivation === "legacy"
    ? recoveryPhraseToAddressLegacy(phrase)
    : recoveryPhraseToAddressStandard(phrase);
}

/** Default: standard BIP44 (MetaMask-compatible). Pass `legacy` for pre-fix Garuda wallets. */
export function recoveryPhraseToPrivateKey(
  phrase: string,
  derivation: RecoveryDerivation = "standard",
): Hex {
  return derivation === "legacy"
    ? recoveryPhraseToPrivateKeyLegacy(phrase)
    : recoveryPhraseToPrivateKeyStandard(phrase);
}

export function recoveryPhraseMatchesAddress(
  phrase: string,
  expectedAddress: string,
): RecoveryDerivation | null {
  const expected = expectedAddress.toLowerCase();
  if (recoveryPhraseToAddressStandard(phrase) === expected) return "standard";
  if (recoveryPhraseToAddressLegacy(phrase) === expected) return "legacy";
  return null;
}

export function resolveRecoveryPrivateKey(
  phrase: string,
  expectedAddress?: string,
): { privateKey: Hex; address: string; derivation: RecoveryDerivation } {
  const signing = resolvePhraseSigningAccount(phrase, expectedAddress);
  const privateKey = signing.derivation === "standard"
    ? recoveryPhraseToPrivateKeyStandard(normalizeRecoveryPhrase(phrase))
    : recoveryPhraseToPrivateKeyLegacy(normalizeRecoveryPhrase(phrase));
  return {
    privateKey,
    address: signing.address,
    derivation: signing.derivation,
  };
}

export type PhraseSigningAccount = {
  account: HDAccount | PrivateKeyAccount;
  address: string;
  checksum: string;
  derivation: RecoveryDerivation;
};

function checksumAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed) return "";
  try {
    if (!isAddress(trimmed, { strict: false })) return trimmed.toLowerCase();
    return getAddress(trimmed);
  } catch {
    return trimmed.toLowerCase();
  }
}

/** Resolve HD (MetaMask) or legacy Garuda account for signing. */
export function resolvePhraseSigningAccount(
  phrase: string,
  expectedAddress?: string,
): PhraseSigningAccount {
  const normalized = normalizeRecoveryPhrase(phrase);
  if (!isValidGarudaRecoveryPhrase(normalized)) {
    throw Object.assign(new Error("Invalid recovery phrase"), { code: "wallet/invalid-phrase" });
  }

  const buildStandard = (): PhraseSigningAccount => {
    const account = mnemonicToAccount(normalized, { path: STANDARD_ETH_DERIVATION_PATH });
    const checksum = checksumAddress(account.address);
    return {
      account,
      address: account.address.toLowerCase(),
      checksum,
      derivation: "standard",
    };
  };

  const buildLegacy = (): PhraseSigningAccount => {
    const account = privateKeyToAccount(recoveryPhraseToPrivateKeyLegacy(normalized));
    const checksum = checksumAddress(account.address);
    return {
      account,
      address: account.address.toLowerCase(),
      checksum,
      derivation: "legacy",
    };
  };

  if (expectedAddress) {
    const match = recoveryPhraseMatchesAddress(normalized, expectedAddress);
    if (!match) {
      throw Object.assign(
        new Error("Recovery phrase does not match wallet address"),
        { code: "wallet/invalid-phrase" },
      );
    }
    return match === "standard" ? buildStandard() : buildLegacy();
  }

  return buildStandard();
}

export function recoveryPhraseImportPreview(phrase: string): {
  standard: string;
  legacy: string;
  preferred: string;
  isExportStyle: boolean;
} | null {
  const normalized = normalizeRecoveryPhrase(phrase);
  if (!isValidGarudaRecoveryPhrase(normalized)) return null;
  try {
    const standard = recoveryPhraseToAddressStandard(normalized);
    const legacy = recoveryPhraseToAddressLegacy(normalized);
    const isExportStyle = phraseWordCount(normalized) === 24 && standard !== legacy;
    return {
      standard,
      legacy,
      preferred: isExportStyle ? legacy : standard,
      isExportStyle,
    };
  } catch {
    return null;
  }
}

/** Ordered candidates: BIP44 (MetaMask) first, legacy Garuda second. */
export function listPhraseSigningAccounts(phrase: string): PhraseSigningAccount[] {
  const normalized = normalizeRecoveryPhrase(phrase);
  if (!isValidGarudaRecoveryPhrase(normalized)) {
    throw Object.assign(new Error("Invalid recovery phrase"), { code: "wallet/invalid-phrase" });
  }

  const standardAccount = mnemonicToAccount(normalized, { path: STANDARD_ETH_DERIVATION_PATH });
  const standard: PhraseSigningAccount = {
    account: standardAccount,
    address: standardAccount.address.toLowerCase(),
    checksum: checksumAddress(standardAccount.address),
    derivation: "standard",
  };

  const legacyAccount = privateKeyToAccount(recoveryPhraseToPrivateKeyLegacy(normalized));
  const legacy: PhraseSigningAccount = {
    account: legacyAccount,
    address: legacyAccount.address.toLowerCase(),
    checksum: checksumAddress(legacyAccount.address),
    derivation: "legacy",
  };

  if (standard.address === legacy.address) return [standard];
  // 24-word Garuda Premium export backup encodes raw private key, legacy path, not MetaMask HD.
  if (phraseWordCount(normalized) === 24) return [legacy, standard];
  return [standard, legacy];
}

/** Garuda server export only, encodes raw private key bytes as BIP39 (not HD import). */
export function privateKeyToGarudaRecoveryPhrase(privateKey: Hex): string {
  const hex = privateKey.replace(/^0x/i, "");
  if (hex.length !== 64) throw new Error("Invalid private key length");
  const entropy = new Uint8Array(hex.length / 2);
  for (let i = 0; i < entropy.length; i += 1) {
    entropy[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return entropyToMnemonic(entropy, wordlist);
}
