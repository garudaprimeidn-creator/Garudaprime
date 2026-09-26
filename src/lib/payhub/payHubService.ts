import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import { transferGat } from "../web3/gatTransfer";
import { isGatContractConfigured } from "../web3/gatToken";
import type { WalletProvider } from "../web3/walletService";
import type { PayQrChannel } from "../../app/appTypes";
import {
  isPayHubApiConfigured,
  settleViaPayHubApi,
} from "./payHubApi";

export type PayReceiptStatus = "confirmed" | "pending" | "failed";

export type PayReceipt = {
  id: string;
  channel: PayQrChannel;
  merchantId: string;
  merchantName: string;
  amount: string;
  token: "GAT";
  payerAddress: string;
  status: PayReceiptStatus;
  createdAt: number;
  txHash?: string;
  receiptCode: string;
  feeAmountGat?: number;
  grossAmountGat?: number;
};

export type PaySettlementInput = {
  channel: PayQrChannel;
  amount: string;
  payerAddress: string;
  merchantId?: string;
  merchantName?: string;
  /** On-chain recipient, from scanned QR or env merchant wallet */
  recipientAddress?: string;
  walletProvider?: WalletProvider;
  uid?: string;
  invoiceId?: string;
  invoiceNote?: string;
};

/** Resolve merchant on-chain wallet (scan → env → connected fallback). */
export const resolveMerchantOnchainAddress = (
  ...candidates: Array<string | null | undefined>
): string | null => {
  for (const c of candidates) {
    const raw = c?.trim();
    if (raw && /^0x[a-fA-F0-9]{40}$/i.test(raw)) return raw;
  }
  return null;
};

export type PaySettlementResult = {
  receipt: PayReceipt;
  simulated: boolean;
};

const RECEIPTS_STORAGE = "garuda_pay_receipts";

export const PAY_HUB = {
  merchantId: import.meta.env.VITE_PAY_HUB_MERCHANT_ID || "GP-MRT-2847",
  merchantName: import.meta.env.VITE_PAY_HUB_MERCHANT_NAME || "Garuda Halal Mart",
  merchantAddress: (() => {
    const raw = import.meta.env.VITE_PAY_HUB_MERCHANT_ADDRESS?.trim();
    return raw && /^0x[a-fA-F0-9]{40}$/.test(raw) ? raw : null;
  })(),
} as const;

const receiptCode = () =>
  `GP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const persistLocal = (receipt: PayReceipt) => {
  try {
    const raw = localStorage.getItem(RECEIPTS_STORAGE);
    const list: PayReceipt[] = raw ? JSON.parse(raw) : [];
    list.unshift(receipt);
    localStorage.setItem(RECEIPTS_STORAGE, JSON.stringify(list.slice(0, 100)));
  } catch {
    /* storage full or private mode */
  }
};

const persistFirestore = async (receipt: PayReceipt, uid?: string) => {
  if (!isFirebaseConfigured || !db || !uid) return;
  try {
    await addDoc(collection(db, "pay_receipts"), {
      ...receipt,
      uid,
      createdAt: serverTimestamp(),
    });
  } catch {
    /* local mode: rules block client writes, receipt stays in localStorage */
  }
};

export const getStoredPayReceipts = (): PayReceipt[] => {
  try {
    const raw = localStorage.getItem(RECEIPTS_STORAGE);
    return raw ? (JSON.parse(raw) as PayReceipt[]) : [];
  } catch {
    return [];
  }
};

const mapApiReceipt = (raw: {
  id: string;
  channel: PayQrChannel;
  merchantId: string;
  merchantName: string;
  amount: string;
  payerAddress: string;
  status: PayReceiptStatus;
  receiptCode: string;
  txHash?: string | null;
  onChainTxHash?: string | null;
  feeAmount?: number | string | null;
  grossAmount?: number | string | null;
  createdAt: number;
}): PayReceipt => ({
  id: raw.id,
  channel: raw.channel,
  merchantId: raw.merchantId,
  merchantName: raw.merchantName,
  amount: raw.amount,
  token: "GAT",
  payerAddress: raw.payerAddress,
  status: raw.status,
  createdAt: raw.createdAt,
  receiptCode: raw.receiptCode,
  txHash: raw.txHash ?? raw.onChainTxHash ?? undefined,
  feeAmountGat: raw.feeAmount != null ? Number(raw.feeAmount) : undefined,
  grossAmountGat: raw.grossAmount != null ? Number(raw.grossAmount) : undefined,
});

/** Garuda Pay Hub, off-chain instant settlement or on-chain GAT transfer */
export const settlePayment = async (input: PaySettlementInput): Promise<PaySettlementResult> => {
  const {
    channel,
    amount,
    payerAddress,
    walletProvider,
    uid,
    recipientAddress,
    merchantId = PAY_HUB.merchantId,
    merchantName = PAY_HUB.merchantName,
    invoiceId,
    invoiceNote,
  } = input;
  const onchainRecipient = channel === "onchain"
    ? resolveMerchantOnchainAddress(recipientAddress)
    : null;

  if (isPayHubApiConfigured()) {
    let txHash: string | undefined;
    const merchantQrPay = Boolean(merchantId);
    const skipClientTransfer = merchantQrPay;

    if (
      channel === "onchain"
      && !skipClientTransfer
      && isGatContractConfigured()
      && onchainRecipient
    ) {
      const result = await transferGat(
        payerAddress,
        onchainRecipient,
        amount,
        walletProvider,
      );
      txHash = result.txHash ?? undefined;
    }

    const { receipt: apiReceipt, simulated } = await settleViaPayHubApi({
      channel,
      amount,
      merchantId,
      payerAddress,
      recipientVault: onchainRecipient ?? undefined,
      txHash,
      invoiceId: invoiceId?.trim() || undefined,
      invoiceNote: invoiceNote?.trim() || undefined,
    });

    const receipt = mapApiReceipt(apiReceipt);
    persistLocal(receipt);
    return { receipt, simulated };
  }

  const id = crypto.randomUUID();
  const base: PayReceipt = {
    id,
    channel,
    merchantId,
    merchantName,
    amount,
    token: "GAT",
    payerAddress,
    status: "confirmed",
    createdAt: Date.now(),
    receiptCode: receiptCode(),
  };

  if (channel === "offchain") {
    await persistFirestore(base, uid);
    persistLocal(base);
    return { receipt: base, simulated: false };
  }

  /* on-chain */
  if (!isGatContractConfigured() || !onchainRecipient) {
    const pending: PayReceipt = { ...base, status: "pending" };
    await persistFirestore(pending, uid);
    persistLocal(pending);
    return { receipt: pending, simulated: true };
  }

  try {
    const { txHash, simulated } = await transferGat(
      payerAddress,
      onchainRecipient,
      amount,
      walletProvider,
    );

    const receipt: PayReceipt = {
      ...base,
      status: simulated ? "pending" : "confirmed",
      txHash: txHash ?? undefined,
    };
    await persistFirestore(receipt, uid);
    persistLocal(receipt);
    return { receipt, simulated };
  } catch {
    const failed: PayReceipt = { ...base, status: "failed" };
    persistLocal(failed);
    throw new Error("On-chain payment failed");
  }
};
