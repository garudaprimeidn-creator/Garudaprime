import type { Tx } from "../../app/appTypes";
import { sanitizeTransactionHistory } from "./transactionSanitizer";
import { extractReceiptCode, payReceiptLinkKey, sortTransactionsByTimeDesc } from "./transactionDedup";
import { isMerchantPayHubReceive } from "./txDisplay";

const STORAGE_PREFIX = "garuda_transactions";
export const DEMO_STORAGE_UID = "demo";

function storageKey(uid?: string): string {
  if (uid === DEMO_STORAGE_UID) return `${STORAGE_PREFIX}_demo`;
  return uid ? `${STORAGE_PREFIX}_${uid}` : STORAGE_PREFIX;
}

/** Scope for local tx storage: guest | demo | authenticated user */
export function resolveTxStorageScope(userId?: string | null, isDemoUser?: boolean): string | undefined {
  if (isDemoUser) return DEMO_STORAGE_UID;
  return userId ?? undefined;
}

export function loadTransactions(uid?: string): Tx[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Tx[];
    return sanitizeTransactionHistory(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

export function saveTransactions(uid: string | undefined, items: Tx[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(uid), JSON.stringify(sanitizeTransactionHistory(items)));
}

export function nextTransactionId(items: Tx[]): number {
  return items.reduce((max, tx) => Math.max(max, tx.id), 0) + 1;
}

function txCompletenessRank(tx: Tx): number {
  let rank = 0;
  const status = (tx.status ?? "").toLowerCase();
  if (status.includes("terkonfirmasi") || status.includes("confirmed") || status.includes("sukses")) {
    rank += 1_000;
  } else if (status.includes("menunggu") || status.includes("pending") || status.includes("proses")) {
    rank += 100;
  } else if (status.includes("dibatalkan") || status.includes("cancel")) {
    rank += 10;
  }
  if (tx.txHash?.trim()) rank += 50;
  if (tx.counterpartyWallet?.trim()) rank += 20;
  if (tx.addr?.trim() && tx.addr !== "Transfer masuk") rank += 5;
  return rank;
}

function mergeTxRow(a: Tx, b: Tx): Tx {
  const rankA = txCompletenessRank(a);
  const rankB = txCompletenessRank(b);
  const primary = rankA !== rankB ? (rankA > rankB ? a : b) : (a.id >= b.id ? a : b);
  const secondary = primary.id === a.id ? b : a;
  const receiptCode = primary.receiptCode ?? secondary.receiptCode ?? extractReceiptCode(secondary) ?? undefined;
  return {
    ...primary,
    receiptCode,
    merchantId: primary.merchantId ?? secondary.merchantId,
    txHash: primary.txHash ?? secondary.txHash,
    networkFee: primary.networkFee ?? secondary.networkFee,
    counterpartyWallet: primary.counterpartyWallet ?? secondary.counterpartyWallet,
    usd: isMerchantPayHubReceive({ ...primary, receiptCode })
      ? "+$0.00"
      : primary.usd,
  };
}

/** Union local + remote rows, remote empty snapshot must not wipe local history. */
export function mergeTransactions(local: Tx[], remote: Tx[]): Tx[] {
  const byId = new Map<number, Tx>();
  for (const tx of [...local, ...remote]) {
    const prev = byId.get(tx.id);
    byId.set(tx.id, prev ? mergeTxRow(prev, tx) : tx);
  }

  const byHash = new Map<string, Tx>();
  const byReceipt = new Map<string, Tx>();
  const withoutHash: Tx[] = [];
  for (const tx of byId.values()) {
    const receiptKey = payReceiptLinkKey(tx);
    if (receiptKey) {
      const prev = byReceipt.get(receiptKey);
      byReceipt.set(receiptKey, prev ? mergeTxRow(prev, tx) : tx);
      continue;
    }

    const hash = tx.txHash?.trim().toLowerCase();
    if (!hash) {
      withoutHash.push(tx);
      continue;
    }
    const prev = byHash.get(hash);
    byHash.set(hash, prev ? mergeTxRow(prev, tx) : tx);
  }

  return sanitizeTransactionHistory(
    sortTransactionsByTimeDesc([...withoutHash, ...byHash.values(), ...byReceipt.values()]),
  );
}

/** Move legacy unscoped cache into per-user storage on login. */
export function migrateLegacyTransactions(uid: string): Tx[] {
  const legacy = loadTransactions();
  const scoped = loadTransactions(uid);
  if (!legacy.length) return scoped;
  const merged = mergeTransactions(scoped, legacy);
  saveTransactions(uid, merged);
  if (typeof window !== "undefined") {
    localStorage.removeItem(storageKey());
  }
  return merged;
}

export type StoredTx = Tx & { uid: string; createdAt: string };
