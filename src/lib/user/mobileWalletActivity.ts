import type { Tx } from "../../app/appTypes";
import { isStandalonePwa } from "../auth/oauthEnvironment";

const PENDING_KEY = "garuda_mobile_pending_tx";
const TXHASH_KEY = "gp_mobile_tx_hash";

export type MobilePendingKind = "wallet" | "deposit";

export type MobilePendingRecord = {
  txId: number;
  uid?: string;
  startedAt: string;
  kind?: MobilePendingKind;
  walletAddress?: string;
  amountGat?: number;
  txHash?: string;
};

export type MobilePendingMeta = {
  kind?: MobilePendingKind;
  walletAddress?: string;
  amountGat?: number;
};

export function isMobileWalletContext(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  return ua || isStandalonePwa();
}

export function stashMobileTxHash(hash: string): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(TXHASH_KEY, hash);
  }
  patchMobilePending({ txHash: hash });
}

export function peekMobileTxHash(): string | null {
  if (typeof sessionStorage !== "undefined") {
    const fromSession = sessionStorage.getItem(TXHASH_KEY);
    if (fromSession) return fromSession;
  }
  return loadMobilePending()?.txHash ?? null;
}

export function takeMobileTxHash(): string | null {
  const pendingHash = loadMobilePending()?.txHash ?? null;
  if (typeof sessionStorage !== "undefined") {
    const fromSession = sessionStorage.getItem(TXHASH_KEY);
    if (fromSession) sessionStorage.removeItem(TXHASH_KEY);
    if (fromSession) return fromSession;
  }
  return pendingHash;
}

export function saveMobilePending(record: MobilePendingRecord): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PENDING_KEY, JSON.stringify(record));
}

export function patchMobilePending(patch: Partial<MobilePendingRecord>): void {
  const current = loadMobilePending();
  if (!current) return;
  saveMobilePending({ ...current, ...patch });
}

export function loadMobilePending(): MobilePendingRecord | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MobilePendingRecord;
    return parsed && typeof parsed.txId === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearMobilePending(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(PENDING_KEY);
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(TXHASH_KEY);
  }
}

export type MobileTxHandlers = {
  beginMobileTransaction: (draft: Omit<Tx, "id">, meta?: MobilePendingMeta) => number;
  completeMobileTransaction: (txId: number, patch: Partial<Tx>) => void;
  cancelMobileTransaction: (txId: number) => void;
  addTransaction: (tx: Omit<Tx, "id">) => void;
};

/** Record wallet activity, on mobile/PWA, persist pending before redirect to wallet app. */
export async function recordWalletTransaction(
  handlers: MobileTxHandlers,
  draft: Omit<Tx, "id">,
  pendingStatus: string,
  execute: () => Promise<{ txHash?: string | null }>,
  confirmed?: Partial<Omit<Tx, "id">> | ((result: { txHash?: string | null }) => Partial<Omit<Tx, "id">>),
): Promise<boolean> {
  const mobile = isMobileWalletContext();

  let txId = -1;
  if (mobile) {
    txId = handlers.beginMobileTransaction({ ...draft, status: pendingStatus }, { kind: "wallet" });
  }

  try {
    const result = await execute();
    if (!result.txHash) {
      if (mobile && txId >= 0) handlers.cancelMobileTransaction(txId);
      return false;
    }

    const confirmedPatch = typeof confirmed === "function" ? confirmed(result) : confirmed;
    const confirmedStatus = confirmedPatch?.status ?? draft.status ?? "Terkonfirmasi";
    if (mobile && txId >= 0) {
      handlers.completeMobileTransaction(txId, {
        ...confirmedPatch,
        txHash: result.txHash,
        status: confirmedStatus,
      });
    } else {
      handlers.addTransaction({
        ...draft,
        ...confirmedPatch,
        txHash: result.txHash,
        status: confirmedStatus,
      });
    }
    return true;
  } catch (err) {
    if (mobile && txId >= 0) handlers.cancelMobileTransaction(txId);
    throw err;
  }
}

export function isPendingTxStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes("menunggu") || s.includes("pending") || s.includes("tertunda");
}

export function isCancelledTxStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes("batal") || s.includes("cancel");
}
