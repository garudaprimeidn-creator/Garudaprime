/**
 * Pay Hub ledger mode, controls hybrid vs full on-chain migration (ADR-005).
 * Default `hybrid` preserves production Firestore ledger (ADR-001).
 */

export type PayHubLedgerMode = "hybrid" | "shadow" | "onchain";

export type PayHubOnChainContracts = {
  payment?: string;
  merchant?: string;
  marketplace?: string;
  reward?: string;
  validator?: string;
  governance?: string;
  gatToken?: string;
};

export function getPayHubLedgerMode(): PayHubLedgerMode {
  const raw = process.env.PAY_HUB_LEDGER_MODE?.trim().toLowerCase();
  if (raw === "shadow" || raw === "onchain") return raw;
  return "hybrid";
}

export function isOnChainLedgerEnabled(): boolean {
  return getPayHubLedgerMode() !== "hybrid";
}

export function isOnChainLedgerPrimary(): boolean {
  return getPayHubLedgerMode() === "onchain";
}

/** Phase 2: include on-chain GAT balance in ledger API (shadow merges with Firestore). */
export function shouldReadChainBalance(): boolean {
  const mode = getPayHubLedgerMode();
  return mode === "shadow" || mode === "onchain";
}

export function shouldShadowWriteOnChain(): boolean {
  const mode = getPayHubLedgerMode();
  return mode === "shadow" || mode === "onchain";
}

export function loadPayHubOnChainContracts(): PayHubOnChainContracts | null {
  const raw = process.env.PAY_HUB_ONCHAIN_CONTRACTS_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PayHubOnChainContracts;
  } catch {
    return null;
  }
}

export function isPayHubOnChainConfigured(): boolean {
  const c = loadPayHubOnChainContracts();
  return Boolean(c?.payment && c?.gatToken);
}
