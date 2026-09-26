import { createHash } from "node:crypto";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { resolveGarudaWalletMasterSecretSync } from "./garudaWalletKms.js";

function masterSecret(): string {
  return resolveGarudaWalletMasterSecretSync();
}

/** Deterministic Garuda Prime private key for uid (server-only). */
export function deriveGarudaPrivateKeyForUid(uid: string): Hex {
  const digest = createHash("sha256")
    .update(`garuda-native-wallet:v1:${masterSecret()}:${uid}`)
    .digest("hex");
  return `0x${digest}` as Hex;
}

/** 24-word BIP39 encoding of the raw private key, Garuda-specific, not MetaMask HD import. */
export function privateKeyToGarudaRecoveryPhrase(privateKey: Hex): string {
  const hex = privateKey.replace(/^0x/i, "");
  if (hex.length !== 64) throw new Error("Invalid private key length");
  const entropy = Uint8Array.from(Buffer.from(hex, "hex"));
  return entropyToMnemonic(entropy, wordlist);
}

export function buildGarudaWalletExport(uid: string): {
  address: string;
  privateKey: Hex;
  recoveryPhrase: string;
  network: string;
  chainId: number;
} {
  const privateKey = deriveGarudaPrivateKeyForUid(uid);
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address.toLowerCase(),
    privateKey,
    recoveryPhrase: privateKeyToGarudaRecoveryPhrase(privateKey),
    network: "SDA Sidra Network",
    chainId: Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453,
  };
}
