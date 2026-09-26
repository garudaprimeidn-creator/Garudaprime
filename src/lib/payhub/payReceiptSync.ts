import { collection, getDocs, limit, onSnapshot, query, where } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import { fetchPayReceipt, getPayHubAuthToken } from "./payHubApi";
import { extractReceiptCode } from "../user/transactionDedup";
import { waitForOnChainTxConfirmation, type TxConfirmationResult } from "../web3/txConfirmation";

export type PayReceiptChainData = {
  txHash?: string;
  feeAmountGat?: number;
  invoiceId?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseReceiptRow(receipt: Record<string, unknown>): PayReceiptChainData | null {
  const txHash = String(
    receipt.txHash ?? receipt.onChainTxHash ?? "",
  ).trim();
  const feeRaw = receipt.feeAmount;
  const feeAmountGat = feeRaw != null && feeRaw !== "" ? Number(feeRaw) : undefined;
  const invoiceId = String(receipt.invoiceId ?? "").trim() || undefined;

  if (!txHash && !invoiceId) return null;
  return {
    txHash: txHash || undefined,
    feeAmountGat: Number.isFinite(feeAmountGat) ? feeAmountGat : undefined,
    invoiceId,
  };
}

/** Read receipt hash directly from Firestore (merchant owner / payer can read pay_receipts). */
export async function fetchPayReceiptFromFirestore(
  receiptCode: string,
): Promise<PayReceiptChainData | null> {
  if (!isFirebaseConfigured || !db) return null;
  try {
    const snap = await getDocs(
      query(
        collection(db, "pay_receipts"),
        where("receiptCode", "==", receiptCode),
        limit(1),
      ),
    );
    if (snap.empty) return null;
    return parseReceiptRow(snap.docs[0].data() as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Live listener, hash appears as soon as relay writes pay_receipts. */
export function subscribePayReceiptChainData(
  receiptCode: string,
  onUpdate: (data: PayReceiptChainData) => void,
): () => void {
  if (!isFirebaseConfigured || !db || !receiptCode.trim()) return () => {};
  const q = query(
    collection(db, "pay_receipts"),
    where("receiptCode", "==", receiptCode.trim()),
    limit(1),
  );
  return onSnapshot(q, (snap) => {
    if (snap.empty) return;
    const parsed = parseReceiptRow(snap.docs[0].data() as Record<string, unknown>);
    if (parsed) onUpdate(parsed);
  }, () => undefined);
}

async function fetchReceiptChainOnce(receiptCode: string): Promise<PayReceiptChainData | null> {
  const token = await getPayHubAuthToken().catch(() => null);
  const raw = await fetchPayReceipt(receiptCode, token ?? undefined);
  const receipt = (raw as { receipt?: Record<string, unknown> } | null)?.receipt ?? raw;
  if (receipt && typeof receipt === "object") {
    const parsed = parseReceiptRow(receipt as Record<string, unknown>);
    if (parsed?.txHash) return parsed;
  }
  return fetchPayReceiptFromFirestore(receiptCode);
}

/** Poll Pay Hub receipt until on-chain tx hash is available (relay may finish after settle). */
export async function pollPayReceiptChainData(
  receiptCode: string,
  options?: { attempts?: number; delayMs?: number },
): Promise<PayReceiptChainData | null> {
  const attempts = options?.attempts ?? 24;
  const delayMs = options?.delayMs ?? 900;

  for (let i = 0; i < attempts; i += 1) {
    const chain = await fetchReceiptChainOnce(receiptCode);
    if (chain?.txHash) return chain;
    if (chain?.invoiceId && i === attempts - 1) return chain;
    if (i < attempts - 1) await sleep(delayMs);
  }

  return null;
}

/** Poll until on-chain tx is mined, then return hash metadata. */
export async function pollPayReceiptConfirmation(
  txHash: string,
  options?: { timeoutMs?: number },
): Promise<TxConfirmationResult | null> {
  const hash = txHash.trim();
  if (!hash.startsWith("0x")) return null;
  return waitForOnChainTxConfirmation(hash, {
    timeoutMs: options?.timeoutMs ?? 120_000,
    pollMs: 2_500,
  });
}

/** Backfill on-chain hash + fee for Pay Hub rows; confirm only after tx mined. */
export async function syncPendingPayReceiptHashes(
  items: Array<{ id: number; type?: string; txHash?: string; receiptCode?: string; addr?: string; networkFee?: string; invoiceId?: string; status?: string }>,
  patch: (id: number, data: { txHash?: string; receiptCode?: string; networkFee?: string; status?: string; invoiceId?: string }) => void,
  limitCount = 8,
): Promise<void> {
  const pending = items.filter((tx) => {
    const kind = (tx.type ?? "").trim().toLowerCase();
    if (kind !== "pay" && kind !== "receive") return false;
    const status = (tx.status ?? "").toLowerCase();
    const hasHash = Boolean(tx.txHash?.trim());
    const needsHash = !hasHash && Boolean(extractReceiptCode(tx));
    const needsConfirm = hasHash && !status.includes("terkonfirmasi") && !status.includes("confirmed");
    return needsHash || needsConfirm;
  }).slice(0, limitCount);

  await Promise.all(pending.map(async (tx) => {
    const receiptCode = extractReceiptCode(tx);
    let txHash = tx.txHash?.trim();

    if (!txHash && receiptCode) {
      const chain = await pollPayReceiptChainData(receiptCode, { attempts: 12, delayMs: 700 });
      txHash = chain?.txHash?.trim();
      if (!txHash && !chain?.invoiceId) return;
      if (txHash && !chain?.txHash) {
        /* hash from elsewhere */
      }
      const confirm = txHash
        ? await waitForOnChainTxConfirmation(txHash, { timeoutMs: 8_000, pollMs: 1_500 })
        : { confirmed: false };
      patch(tx.id, {
        ...(txHash ? { txHash } : {}),
        receiptCode: tx.receiptCode ?? receiptCode,
        ...(chain?.feeAmountGat != null && !tx.networkFee?.trim()
          ? { networkFee: `${chain.feeAmountGat.toFixed(4)} GAT` }
          : {}),
        ...(chain?.invoiceId && !tx.invoiceId?.trim() ? { invoiceId: chain.invoiceId } : {}),
        status: confirm.confirmed ? "Terkonfirmasi" : "Pending",
      });
      return;
    }

    if (!txHash) return;
    const confirm = await waitForOnChainTxConfirmation(txHash, { timeoutMs: 10_000, pollMs: 1_500 });
    if (!confirm.confirmed) {
      patch(tx.id, { status: "Pending" });
      return;
    }
    patch(tx.id, { txHash, status: "Terkonfirmasi" });
  }));
}
