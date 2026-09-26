import { tokenToUsd } from "../../app/tokenEconomy";

const SNAPSHOT_PREFIX = "garuda_wallet_snapshot";
const RECENT_OUTBOUND_MS = 120_000;

export type WalletSnapshot = {
  GAT: number;
  SDA: number;
  updatedAt: string;
};

export type InboundTransfer = {
  symbol: "GAT" | "SDA";
  amount: number;
  usd: string;
};

function snapshotKey(address: string): string {
  return `${SNAPSHOT_PREFIX}_${address.toLowerCase()}`;
}

export function loadWalletSnapshot(address: string): WalletSnapshot | null {
  if (typeof localStorage === "undefined" || !address) return null;
  try {
    const raw = localStorage.getItem(snapshotKey(address));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WalletSnapshot;
    if (typeof parsed.GAT !== "number" || typeof parsed.SDA !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveWalletSnapshot(address: string, gat: number, sda: number): void {
  if (typeof localStorage === "undefined" || !address) return;
  const snap: WalletSnapshot = { GAT: gat, SDA: sda, updatedAt: new Date().toISOString() };
  localStorage.setItem(snapshotKey(address), JSON.stringify(snap));
}

const OUTBOUND_KEY = "garuda_recent_outbound";

type OutboundMark = { symbol: string; at: number };

function loadOutboundMarks(): OutboundMark[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(OUTBOUND_KEY);
    return raw ? (JSON.parse(raw) as OutboundMark[]) : [];
  } catch {
    return [];
  }
}

function saveOutboundMarks(marks: OutboundMark[]): void {
  if (typeof sessionStorage === "undefined") return;
  const cutoff = Date.now() - RECENT_OUTBOUND_MS;
  sessionStorage.setItem(
    OUTBOUND_KEY,
    JSON.stringify(marks.filter((m) => m.at >= cutoff).slice(-20)),
  );
}

/** Call when app records send/swap/deposit (outbound from wallet). */
export function markRecentOutbound(symbol: string): void {
  saveOutboundMarks([...loadOutboundMarks(), { symbol: symbol.toUpperCase(), at: Date.now() }]);
}

/** True when wallet recently sent/swap/deposit, RPC may still show pre-tx balance. */
export function hadRecentOutbound(symbol: string): boolean {
  const cutoff = Date.now() - RECENT_OUTBOUND_MS;
  return loadOutboundMarks().some(
    (m) => m.symbol === symbol.toUpperCase() && m.at >= cutoff,
  );
}

const MIN_DELTA = 0.000_001;

/** Compare on-chain balance vs last committed snapshot, does not mutate snapshot. */
export function peekInboundTransfers(
  address: string,
  gat: number,
  sda: number,
): InboundTransfer[] {
  const prev = loadWalletSnapshot(address);
  if (!prev) return [];

  const results: InboundTransfer[] = [];
  const pairs: Array<{ symbol: "GAT" | "SDA"; prev: number; next: number }> = [
    { symbol: "GAT", prev: prev.GAT, next: gat },
    { symbol: "SDA", prev: prev.SDA, next: sda },
  ];

  for (const { symbol, prev: p, next: n } of pairs) {
    const delta = n - p;
    if (delta < MIN_DELTA) continue;
    if (hadRecentOutbound(symbol)) continue;
    results.push({
      symbol,
      amount: delta,
      usd: `$${tokenToUsd(delta, symbol).toFixed(2)}`,
    });
  }

  return results;
}

export const commitWalletSnapshot = saveWalletSnapshot;

export function detectInboundTransfers(
  address: string,
  gat: number,
  sda: number,
): InboundTransfer[] {
  const results = peekInboundTransfers(address, gat, sda);
  saveWalletSnapshot(address, gat, sda);
  return results;
}
