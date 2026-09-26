import type { Tx } from "../../app/appTypes";
import { compareTxByTimeDesc, dedupeTransactions, extractReceiptCode, parseTxTimeMs, payCompletenessRank, receiveCompletenessRank, sortTransactionsByTimeDesc, transactionDedupKey } from "./transactionDedup";
import { isMerchantPayHubReceive } from "./txDisplay";
import { parseTxTokenAmount } from "./inboundTransferResolver";

const CHAIN_IMPORT_TIME = "baru saja";
const JUST_NOW_LABELS = new Set(["baru saja", "just now"]);

/** Legacy rows stored "Baru saja", infer ISO from newest known tx time + id order. */
function coalesceLegacyJustNowTimes(items: Tx[]): Tx[] {
  const legacy = items.filter((tx) => JUST_NOW_LABELS.has(tx.time.trim().toLowerCase()));
  if (!legacy.length) return items;

  const parsedTimes = items
    .map((tx) => parseTxTimeMs(tx.time ?? ""))
    .filter((ms): ms is number => ms != null);
  const baseMs = parsedTimes.length ? Math.max(...parsedTimes) : Date.now();
  const sortedLegacy = [...legacy].sort((a, b) => a.id - b.id);
  const idToIso = new Map<number, string>();
  sortedLegacy.forEach((tx, index) => {
    idToIso.set(tx.id, new Date(baseMs + (index + 1) * 1000).toISOString());
  });

  return items.map((tx) => {
    const iso = idToIso.get(tx.id);
    return iso ? { ...tx, time: iso } : tx;
  });
}

function txKind(type: string | undefined): string {
  return (type ?? "send").trim().toLowerCase() || "send";
}

/** Coerce partial / Firestore rows so UI never crashes on missing fields. */
export function normalizeTx(raw: Partial<Tx> & { id?: number }): Tx | null {
  const id = Number(raw.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  const amount = String(raw.amount ?? "·").trim() || "·";
  const time = String(raw.time ?? "").trim() || "·";
  const type = String(raw.type ?? "send").trim() || "send";
  const receiptCode = raw.receiptCode?.trim() || extractReceiptCode({ addr: String(raw.addr ?? "") }) || undefined;
  const usd = isMerchantPayHubReceive({ type, receiptCode, addr: String(raw.addr ?? "") })
    ? "+$0.00"
    : (String(raw.usd ?? "·").trim() || "·");
  const status = String(raw.status ?? "Confirmed").trim() || "Confirmed";
  const addr = String(raw.addr ?? "·").trim() || "·";

  return {
    id,
    type,
    amount,
    addr,
    time,
    usd,
    status,
    counterpartyWallet: raw.counterpartyWallet?.trim() || undefined,
    txHash: raw.txHash?.trim() || undefined,
    networkFee: raw.networkFee?.trim() || undefined,
    receiptCode,
    merchantId: raw.merchantId?.trim() || undefined,
    invoiceId: raw.invoiceId?.trim() || undefined,
  };
}

/** Rows created by removed chain-backfill importer (not in-app P2P / invest). */
function isChainImportedReceive(tx: Tx): boolean {
  return txKind(tx.type) === "receive"
    && (tx.time?.trim().toLowerCase() ?? "") === CHAIN_IMPORT_TIME
    && Boolean(tx.txHash?.trim())
    && Boolean(tx.counterpartyWallet?.trim());
}

/** Prefer send/withdraw/deposit over duplicate receive for the same on-chain hash. */
function preferExplicitOverInbound(items: Tx[]): Tx[] {
  const byHash = new Map<string, Tx[]>();
  for (const tx of items) {
    const hash = tx.txHash?.trim().toLowerCase();
    if (!hash) continue;
    const bucket = byHash.get(hash) ?? [];
    bucket.push(tx);
    byHash.set(hash, bucket);
  }

  const dropIds = new Set<number>();
  for (const bucket of byHash.values()) {
    if (bucket.length < 2) continue;
    const explicit = bucket.find((tx) => {
      const k = txKind(tx.type);
      return k === "send" || k === "withdraw" || k === "deposit" || k === "pay";
    });
    if (!explicit) continue;
    for (const tx of bucket) {
      if (tx.id !== explicit.id && txKind(tx.type) === "receive") {
        dropIds.add(tx.id);
      }
    }
  }

  return items.filter((tx) => !dropIds.has(tx.id));
}

/** Remove chain-backfill receive rows (phantom +64 GAT, +1.57 SDA, etc.). */
function dropChainImportedReceives(items: Tx[]): Tx[] {
  return items.filter((tx) => !isChainImportedReceive(tx));
}

function collapseNearDuplicateReceives(items: Tx[]): Tx[] {
  const WINDOW_MS = 10 * 60 * 1000;
  const dropIds = new Set<number>();
  const receives = items.filter((tx) => txKind(tx.type) === "receive");

  for (let i = 0; i < receives.length; i += 1) {
    for (let j = i + 1; j < receives.length; j += 1) {
      const a = receives[i];
      const b = receives[j];
      const parsedA = parseTxTokenAmount(a.amount);
      const parsedB = parseTxTokenAmount(b.amount);
      if (!parsedA || !parsedB) continue;
      if (parsedA.symbol !== parsedB.symbol) continue;
      if (Math.abs(parsedA.value - parsedB.value) > 0.000001) continue;

      const hashA = a.txHash?.trim().toLowerCase();
      const hashB = b.txHash?.trim().toLowerCase();
      if (hashA && hashB) {
        if (hashA === hashB) dropIds.add(Math.min(a.id, b.id));
        continue;
      }

      const timeA = parseTxTimeMs(a.time ?? "");
      const timeB = parseTxTimeMs(b.time ?? "");
      const closeInTime = timeA == null
        || timeB == null
        || Math.abs(timeA - timeB) <= WINDOW_MS;
      if (!closeInTime) continue;

      const keep = receiveCompletenessRank(a) >= receiveCompletenessRank(b) ? a : b;
      const drop = keep.id === a.id ? b : a;
      dropIds.add(drop.id);
    }
  }

  return items.filter((tx) => !dropIds.has(tx.id));
}

function collapseNearDuplicatePays(items: Tx[]): Tx[] {
  const WINDOW_MS = 10 * 60 * 1000;
  const dropIds = new Set<number>();
  const pays = items.filter((tx) => txKind(tx.type) === "pay");

  for (let i = 0; i < pays.length; i += 1) {
    for (let j = i + 1; j < pays.length; j += 1) {
      const a = pays[i];
      const b = pays[j];
      const parsedA = parseTxTokenAmount(a.amount.replace(/^-/, ""));
      const parsedB = parseTxTokenAmount(b.amount.replace(/^-/, ""));
      if (!parsedA || !parsedB) continue;
      if (parsedA.symbol !== parsedB.symbol) continue;
      if (Math.abs(parsedA.value - parsedB.value) > 0.000001) continue;

      const receiptA = extractReceiptCode(a);
      const receiptB = extractReceiptCode(b);
      if (receiptA && receiptB && receiptA.toLowerCase() !== receiptB.toLowerCase()) continue;

      const hashA = a.txHash?.trim().toLowerCase();
      const hashB = b.txHash?.trim().toLowerCase();
      if (hashA && hashB) {
        if (hashA === hashB) dropIds.add(Math.min(a.id, b.id));
        continue;
      }

      const timeA = parseTxTimeMs(a.time ?? "");
      const timeB = parseTxTimeMs(b.time ?? "");
      const closeInTime = timeA == null
        || timeB == null
        || Math.abs(timeA - timeB) <= WINDOW_MS;
      if (!closeInTime) continue;

      const keep = payCompletenessRank(a) >= payCompletenessRank(b) ? a : b;
      const drop = keep.id === a.id ? b : a;
      dropIds.add(drop.id);
    }
  }

  return items.filter((tx) => !dropIds.has(tx.id));
}

/** Pelanggan bayar merchant, jangan simpan/tampilkan biaya layanan di riwayat. */
function stripPayCustomerFees(items: Tx[]): Tx[] {
  return items.map((tx) => {
    if (txKind(tx.type) !== "pay" || !tx.networkFee?.trim()) return tx;
    const { networkFee: _fee, ...rest } = tx;
    return rest;
  });
}

/**
 * Normalize local + remote history:
 * - dedupe by hash/amount
 * - remove phantom chain-sync receives
 * - keep user-initiated send/deposit rows when hash collides
 */
export function sanitizeTransactionHistory(items: Array<Partial<Tx> & { id?: number }>): Tx[] {
  const normalized = items
    .map((item) => normalizeTx(item))
    .filter((tx): tx is Tx => tx !== null);
  const coalesced = coalesceLegacyJustNowTimes(normalized);
  const sorted = sortTransactionsByTimeDesc(coalesced);
  const afterExplicit = preferExplicitOverInbound(sorted);
  const afterImport = dropChainImportedReceives(afterExplicit);
  const afterReceive = collapseNearDuplicateReceives(afterImport);
  const afterPay = collapseNearDuplicatePays(afterReceive);
  const afterPayFees = stripPayCustomerFees(afterPay);
  const deduped = dedupeTransactions(afterPayFees);

  const seen = new Set<string>();
  return sortTransactionsByTimeDesc(deduped.filter((tx) => {
    const key = transactionDedupKey(tx);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
}
