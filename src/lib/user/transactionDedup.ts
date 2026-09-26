import type { Tx } from "../../app/appTypes";
import { parseTxTokenAmount } from "./inboundTransferResolver";

function txKind(type: string | undefined): string {
  return (type ?? "send").trim().toLowerCase() || "send";
}

function normalizeReceiveAmount(amount: string): string | null {
  const parsed = parseTxTokenAmount(amount);
  if (!parsed) return null;
  return `${parsed.symbol}:${parsed.value.toFixed(6)}`;
}

const JUST_NOW_LABELS = new Set(["baru saja", "just now"]);

const LOCALE_MONTHS: Record<string, number> = {
  jan: 0, january: 0, januari: 0,
  feb: 1, february: 1, februari: 1,
  mar: 2, march: 2, maret: 2,
  apr: 3, april: 3,
  may: 4, mei: 4,
  jun: 5, june: 5, juni: 5,
  jul: 6, july: 6, juli: 6,
  aug: 7, august: 7, agu: 7, agustus: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, okt: 9, oktober: 9,
  nov: 10, november: 10,
  dec: 11, december: 11, des: 11, desember: 11,
};

function parseLocaleTxTimeMs(raw: string): number | null {
  const match = raw.match(/^(\d{1,2})\s+([A-Za-z\u00C0-\u024F]+)\s+(\d{4}),?\s*(\d{1,2})[.:](\d{2})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = LOCALE_MONTHS[match[2].toLowerCase()];
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month == null || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  const ms = new Date(year, month, day, hour, minute, 0, 0).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function parseTxTimeMs(time: string): number | null {
  const raw = time.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (JUST_NOW_LABELS.has(lower)) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  }
  const localeMs = parseLocaleTxTimeMs(raw);
  if (localeMs != null) return localeMs;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export { parseTxTimeMs };

/** Sort key, parsed wall time when available, else monotonic id. */
export function getTxSortMs(tx: Tx): number {
  const parsed = parseTxTimeMs(tx.time ?? "");
  if (parsed != null) return parsed;
  return tx.id;
}

/** Newest first; id breaks ties for legacy rows without parseable time. */
export function compareTxByTimeDesc(a: Tx, b: Tx): number {
  const ta = getTxSortMs(a);
  const tb = getTxSortMs(b);
  if (ta !== tb) return tb - ta;
  return b.id - a.id;
}

export function sortTransactionsByTimeDesc(items: Tx[]): Tx[] {
  return [...items].sort(compareTxByTimeDesc);
}

const RECEIVE_DEDUP_WINDOW_MS = 10 * 60 * 1000;
const RECEIPT_CODE_PATTERN = /GP-[A-Z0-9]{4,}-[A-Z0-9]{4,}/i;

function isGenericInboundAddr(addr: string): boolean {
  const n = addr.trim().toLowerCase();
  return n === "transfer masuk" || n === ", " || n === "-";
}

export function receiveCompletenessRank(tx: Tx): number {
  let rank = 0;
  if (tx.txHash?.trim()) rank += 100;
  if (tx.counterpartyWallet?.trim()) rank += 50;
  const addr = tx.addr?.trim() ?? "";
  if (addr && !isGenericInboundAddr(addr)) rank += 10;
  rank += Math.min(tx.id, 9999) / 10_000;
  return rank;
}

/** Pay Hub receipt from dedicated field or addr suffix (Garuda Pay · GP-…). */
export function extractReceiptCode(tx: Pick<Tx, "receiptCode" | "addr">): string | null {
  const fromField = tx.receiptCode?.trim();
  if (fromField) return fromField;
  const match = tx.addr?.match(RECEIPT_CODE_PATTERN);
  return match?.[0] ?? null;
}

export function payCompletenessRank(tx: Tx): number {
  let rank = 0;
  if (tx.txHash?.trim()) rank += 100;
  if (extractReceiptCode(tx)) rank += 50;
  if (tx.merchantId?.trim()) rank += 25;
  const addr = tx.addr?.trim() ?? "";
  if (addr && !/^garuda pay/i.test(addr)) rank += 10;
  rank += Math.min(tx.id, 9999) / 10_000;
  return rank;
}

/** Same pay amount in a time window, collapses local + remote Pay Hub rows. */
export function payWindowDedupKey(tx: Tx): string | null {
  if (txKind(tx.type) !== "pay") return null;
  const amountKey = normalizeReceiveAmount(tx.amount.replace(/^-/, ""));
  if (!amountKey) return null;
  const receipt = extractReceiptCode(tx);
  if (receipt) return `paywin:${receipt.toLowerCase()}:${amountKey}`;
  const timeMs = parseTxTimeMs(tx.time ?? "") ?? Date.now();
  const bucket = Math.floor(timeMs / RECEIVE_DEDUP_WINDOW_MS);
  return `paywin:${amountKey}:${bucket}`;
}

/** Receipt-linked pay/receive rows from Pay Hub history sync. */
export function payReceiptLinkKey(tx: Tx): string | null {
  const receipt = extractReceiptCode(tx);
  if (!receipt) return null;
  const kind = txKind(tx.type);
  if (kind !== "pay" && kind !== "receive") return null;
  return `${kind}:${receipt.toLowerCase()}`;
}

/** Merge chain/sync duplicates, keep hash, receipt, fee from either row. */
export function mergeTxMetadata(primary: Tx, secondary: Tx): Tx {
  const score = (tx: Tx) => Math.max(receiveCompletenessRank(tx), payCompletenessRank(tx));
  const pickPrimary = score(primary) >= score(secondary);
  const base = pickPrimary ? primary : secondary;
  const other = pickPrimary ? secondary : primary;
  const receipt = base.receiptCode
    ?? other.receiptCode
    ?? extractReceiptCode(base)
    ?? extractReceiptCode(other)
    ?? undefined;
  const kind = txKind(base.type);
  const usd = kind === "receive" && receipt ? "+$0.00" : (base.usd?.trim() || other.usd?.trim() || base.usd);
  return {
    ...base,
    id: Math.max(primary.id, secondary.id),
    txHash: base.txHash ?? other.txHash,
    receiptCode: receipt,
    networkFee: base.networkFee ?? other.networkFee,
    counterpartyWallet: base.counterpartyWallet ?? other.counterpartyWallet,
    merchantId: base.merchantId ?? other.merchantId,
    invoiceId: base.invoiceId ?? other.invoiceId,
    usd,
    addr: base.addr?.trim() ? base.addr : other.addr,
  };
}

/** Same inbound amount in a time window, ignores hash/id drift between sync sources. */
export function receiveWindowDedupKey(tx: Tx): string | null {
  if (txKind(tx.type) !== "receive") return null;
  const amountKey = normalizeReceiveAmount(tx.amount);
  if (!amountKey) return null;
  const timeMs = parseTxTimeMs(tx.time ?? "") ?? Date.now();
  const bucket = Math.floor(timeMs / RECEIVE_DEDUP_WINDOW_MS);
  return `recvwin:${amountKey}:${bucket}`;
}

/** Stable key for collapsing duplicate history rows. */
export function transactionDedupKey(tx: Tx): string | null {
  if (tx.txHash?.trim()) {
    return `hash:${tx.txHash.trim().toLowerCase()}`;
  }

  const kind = txKind(tx.type);
  if (kind === "pay") {
    const receipt = extractReceiptCode(tx);
    const amountKey = normalizeReceiveAmount(tx.amount.replace(/^-/, ""));
    if (receipt && amountKey) return `pay:${receipt.toLowerCase()}:${amountKey}`;
    if (receipt) return `pay:${receipt.toLowerCase()}`;
    if (amountKey) {
      const timeMs = parseTxTimeMs(tx.time ?? "");
      if (timeMs != null) {
        const bucket = Math.floor(timeMs / RECEIVE_DEDUP_WINDOW_MS);
        return `pay:${amountKey}:t${bucket}`;
      }
    }
    return null;
  }

  if (kind !== "receive") return null;

  const receipt = extractReceiptCode(tx);
  if (receipt) return `recv:${receipt.toLowerCase()}`;

  const amountKey = normalizeReceiveAmount(tx.amount);
  if (!amountKey) return null;

  const addrKey = tx.addr?.trim().toLowerCase();
  if (addrKey && addrKey !== "transfer masuk") return `recv:${amountKey}:${addrKey}`;

  const from = tx.counterpartyWallet?.trim().toLowerCase();
  if (from) return `recv:${amountKey}:${from}`;

  const timeMs = parseTxTimeMs(tx.time ?? "");
  if (timeMs != null) {
    const bucket = Math.floor(timeMs / RECEIVE_DEDUP_WINDOW_MS);
    return `recv:${amountKey}:t${bucket}`;
  }

  return `recv:${amountKey}`;
}

/**
 * Collapse duplicate rows (same txHash, or repeated auto-detected receives).
 * Keeps the newest row (highest id) per dedup key.
 */
export function dedupeTransactions(items: Tx[]): Tx[] {
  const sorted = sortTransactionsByTimeDesc(items);
  const seen = new Set<string>();
  const seenReceiveWindows = new Map<string, Tx>();
  const seenPayWindows = new Map<string, Tx>();
  const result: Tx[] = [];

  for (let tx of sorted) {
    const payWindowKey = payWindowDedupKey(tx);
    if (payWindowKey) {
      const prev = seenPayWindows.get(payWindowKey);
      if (prev) {
        const merged = mergeTxMetadata(tx, prev);
        const idx = result.findIndex((row) => row.id === prev.id);
        if (idx >= 0) result.splice(idx, 1);
        seen.delete(transactionDedupKey(prev) ?? "");
        seenPayWindows.set(payWindowKey, merged);
        tx = merged;
      } else {
        seenPayWindows.set(payWindowKey, tx);
      }
    }

    const windowKey = receiveWindowDedupKey(tx);
    if (windowKey) {
      const prev = seenReceiveWindows.get(windowKey);
      if (prev) {
        const merged = mergeTxMetadata(tx, prev);
        const idx = result.findIndex((row) => row.id === prev.id);
        if (idx >= 0) result.splice(idx, 1);
        seen.delete(transactionDedupKey(prev) ?? "");
        seenReceiveWindows.set(windowKey, merged);
        tx = merged;
      } else {
        seenReceiveWindows.set(windowKey, tx);
      }
    }

    const key = transactionDedupKey(tx);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }

    result.push(tx);
  }

  return sortTransactionsByTimeDesc(result).slice(0, 100);
}

export function hasMatchingTransaction(
  items: Tx[],
  candidate: Pick<Tx, "type" | "amount" | "txHash" | "counterpartyWallet" | "receiptCode" | "time">,
): boolean {
  const draft: Tx = {
    id: 0,
    addr: "",
    time: candidate.time ?? "",
    usd: "",
    status: "",
    ...candidate,
  };
  const key = transactionDedupKey(draft);
  if (key && items.some((tx) => transactionDedupKey(tx) === key)) return true;

  const kind = txKind(candidate.type);
  if (kind === "pay") {
    const receipt = extractReceiptCode(draft);
    const amountKey = normalizeReceiveAmount(candidate.amount.replace(/^-/, ""));
    if (receipt && amountKey) {
      const key = `pay:${receipt.toLowerCase()}:${amountKey}`;
      if (items.some((tx) => transactionDedupKey(tx) === key)) return true;
    }
    if (!amountKey) return false;
    const candidateMs = parseTxTimeMs(candidate.time ?? "") ?? Date.now();
    return items.some((tx) => {
      if (txKind(tx.type) !== "pay") return false;
      if (normalizeReceiveAmount(tx.amount.replace(/^-/, "")) !== amountKey) return false;
      const existingReceipt = extractReceiptCode(tx);
      if (receipt && existingReceipt) return receipt.toLowerCase() === existingReceipt.toLowerCase();
      const existingMs = parseTxTimeMs(tx.time ?? "");
      if (existingMs == null) return true;
      return Math.abs(existingMs - candidateMs) <= RECEIVE_DEDUP_WINDOW_MS;
    });
  }

  if (kind !== "receive") return false;

  const amountKey = normalizeReceiveAmount(candidate.amount);
  if (!amountKey) return false;

  const candidateMs = parseTxTimeMs(candidate.time ?? "") ?? Date.now();
  const candidateHash = candidate.txHash?.trim().toLowerCase();

  return items.some((tx) => {
    if (txKind(tx.type) !== "receive") return false;
    if (normalizeReceiveAmount(tx.amount) !== amountKey) return false;

    const existingHash = tx.txHash?.trim().toLowerCase();
    if (candidateHash && existingHash) return candidateHash === existingHash;

    const existingMs = parseTxTimeMs(tx.time ?? "");
    if (existingMs == null) return true;
    return Math.abs(existingMs - candidateMs) <= RECEIVE_DEDUP_WINDOW_MS;
  });
}
