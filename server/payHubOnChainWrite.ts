/**
 * Per-feature on-chain write cutover (ADR-005 Fase 3).
 * Production default: shadow + no PAY_HUB_ONCHAIN_WRITE_FEATURES → Firestore ledger unchanged.
 */
import { isOnChainLedgerPrimary } from "./payHubLedgerMode.js";

export type PayHubOnChainWriteFeature =
  | "transfer"
  | "merchant"
  | "market"
  | "deposit"
  | "withdraw"
  | "protocol";

const ALL_FEATURES: readonly PayHubOnChainWriteFeature[] = [
  "transfer",
  "merchant",
  "market",
  "deposit",
  "withdraw",
  "protocol",
];

function parseFeatureEnv(): Set<PayHubOnChainWriteFeature> {
  const raw = process.env.PAY_HUB_ONCHAIN_WRITE_FEATURES?.trim();
  if (!raw) return new Set();
  const valid = new Set<string>(ALL_FEATURES);
  const out = new Set<PayHubOnChainWriteFeature>();
  for (const part of raw.split(",")) {
    const f = part.trim().toLowerCase();
    if (valid.has(f)) out.add(f as PayHubOnChainWriteFeature);
  }
  return out;
}

/** Chain is authoritative for this feature (onchain mode enables all). */
export function isOnChainWritePrimaryFor(feature: PayHubOnChainWriteFeature): boolean {
  if (isOnChainLedgerPrimary()) return true;
  return parseFeatureEnv().has(feature);
}

/** Fase 4, stop all pay_ledgers writes (set with final anchor). */
export function isFirestoreLedgerDeprecated(): boolean {
  const raw = process.env.PAY_HUB_FS_LEDGER_DEPRECATED?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  return isOnChainLedgerPrimary();
}

/** Whether pay_ledgers balance should be mutated for this operation. */
export function shouldMutateFirestorePayLedger(feature?: PayHubOnChainWriteFeature): boolean {
  if (isFirestoreLedgerDeprecated()) return false;
  if (feature && isOnChainWritePrimaryFor(feature)) return false;
  return true;
}

export function listOnChainWriteFeatures(): PayHubOnChainWriteFeature[] {
  if (isOnChainLedgerPrimary()) return [...ALL_FEATURES];
  return [...parseFeatureEnv()];
}
