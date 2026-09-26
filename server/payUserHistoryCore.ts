import { adminDb } from "./firebaseAdmin.js";
import { appendUserInbox } from "./userInboxCore.js";
import { resolveWalletDisplayName } from "./walletIdentityCore.js";

const COL = "user_transactions";

export type PayUserHistoryRow = {
  type: string;
  amount: string;
  addr: string;
  counterpartyWallet?: string;
  time: string;
  usd: string;
  status: string;
  txHash?: string;
  receiptCode?: string;
  networkFee?: string;
  merchantId?: string;
  invoiceId?: string;
};

const txDocId = (uid: string, id: number) => `${uid}_${id}`;

const shortAddr = (address: string) => {
  const a = address.trim();
  if (a.length < 12) return a;
  return `${a.slice(0, 8)}…${a.slice(-4)}`;
};

export async function appendUserTransaction(uid: string, row: PayUserHistoryRow): Promise<number> {
  const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  await adminDb().collection(COL).doc(txDocId(uid, id)).set({
    ...row,
    id,
    uid,
    createdAt: new Date().toISOString(),
  }, { merge: true });
  return id;
}

export async function recordPayHubTransferHistory(input: {
  senderUid: string;
  recipientUid: string;
  recipientAddress: string;
  grossAmount: number;
  netAmount: number;
  refId: string;
  txHash?: string | null;
}): Promise<void> {
  const time = new Date().toISOString();
  const status = "Terkonfirmasi";

  const txHash = input.txHash?.trim() || undefined;

  await appendUserTransaction(input.senderUid, {
    type: "send",
    amount: `-${input.grossAmount.toFixed(4)} GAT`,
    addr: `Garuda Pay · ${shortAddr(input.recipientAddress)}`,
    counterpartyWallet: input.recipientAddress,
    time,
    usd: `-$${input.grossAmount.toFixed(2)}`,
    status,
    txHash,
  });

  const senderSnap = await adminDb().collection("users").doc(input.senderUid).get();
  const senderWallet = String(senderSnap.data()?.walletAddress ?? "").trim();
  const senderLabel = senderWallet
    ? await resolveWalletDisplayName(senderWallet).catch(() => null)
    : null;

  const recvTxId = await appendUserTransaction(input.recipientUid, {
    type: "receive",
    amount: `+${input.netAmount.toFixed(4)} GAT`,
    addr: senderLabel ?? (senderWallet ? shortAddr(senderWallet) : `Garuda Pay · ${input.refId}`),
    counterpartyWallet: senderWallet || undefined,
    time,
    usd: `+$${input.netAmount.toFixed(2)}`,
    status,
    txHash,
  });

  await appendUserInbox(input.recipientUid, {
    type: "receive",
    title: "Dana Diterima",
    body: `+${input.netAmount.toFixed(4)} GAT masuk${senderLabel ? ` dari ${senderLabel}` : ""}.`,
    action: { type: "transaction", txId: recvTxId },
  }).catch(() => undefined);
}

export async function recordPayHubDepositHistory(input: {
  uid: string;
  netAmountGat: number;
  txHash: string;
}): Promise<void> {
  const hash = input.txHash;
  await appendUserTransaction(input.uid, {
    type: "deposit",
    amount: `+${input.netAmountGat} GAT`,
    addr: `Pay Hub · ${hash.slice(0, 8)}…${hash.slice(-6)}`,
    time: new Date().toISOString(),
    usd: `+$${input.netAmountGat.toFixed(2)}`,
    status: "Terkonfirmasi",
    txHash: hash,
  });
}

export async function patchUserTransactionsByReceipt(
  receiptCode: string,
  patch: { txHash: string; feeAmount?: number },
): Promise<void> {
  const code = receiptCode.trim();
  if (!code) return;
  const snap = await adminDb().collection(COL)
    .where("receiptCode", "==", code)
    .limit(24)
    .get();
  if (snap.empty) return;

  const feeLabel = patch.feeAmount != null && patch.feeAmount > 0
    ? `${patch.feeAmount.toFixed(4)} GAT`
    : undefined;

  await Promise.all(snap.docs.map((docSnap) => docSnap.ref.set({
    txHash: patch.txHash,
    status: "Terkonfirmasi",
    ...(feeLabel ? { networkFee: feeLabel } : {}),
  }, { merge: true })));
}

export async function recordPayHubMerchantReceiveHistory(input: {
  ownerUid: string;
  payerAddress: string;
  merchantName: string;
  merchantId: string;
  grossAmount: number;
  netAmount: number;
  feeAmount: number;
  receiptCode: string;
  txHash?: string | null;
  invoiceId?: string | null;
}): Promise<void> {
  const payerLabel = await resolveWalletDisplayName(input.payerAddress).catch(() => null);
  const payerShort = shortAddr(input.payerAddress);
  const txHash = input.txHash?.trim() || undefined;
  const feeLabel = input.feeAmount > 0 ? `${input.feeAmount.toFixed(4)} GAT` : undefined;

  const recvTxId = await appendUserTransaction(input.ownerUid, {
    type: "receive",
    amount: `+${input.netAmount.toFixed(4)} GAT`,
    addr: `${payerLabel ?? payerShort} · ${input.receiptCode}`,
    counterpartyWallet: input.payerAddress,
    time: new Date().toISOString(),
    usd: "+$0.00",
    status: "Terkonfirmasi",
    txHash,
    receiptCode: input.receiptCode,
    networkFee: feeLabel,
    merchantId: input.merchantId,
    invoiceId: input.invoiceId?.trim() || undefined,
  });

  await appendUserInbox(input.ownerUid, {
    type: "receive",
    title: "Pembayaran Merchant",
    body: `+${input.netAmount.toFixed(4)} GAT dari ${payerLabel ?? payerShort} · ${input.merchantName}`,
    action: { type: "transaction", txId: recvTxId },
  }).catch(() => undefined);
}

export async function recordPayHubMerchantPayHistory(input: {
  payerUid: string;
  merchantName: string;
  merchantId: string;
  grossAmount: number;
  receiptCode: string;
  txHash?: string | null;
  invoiceId?: string | null;
}): Promise<void> {
  await appendUserTransaction(input.payerUid, {
    type: "pay",
    amount: `-${input.grossAmount.toFixed(4)} GAT`,
    addr: `${input.merchantName} · ${input.receiptCode}`,
    time: new Date().toISOString(),
    usd: `-$${input.grossAmount.toFixed(2)}`,
    status: "Terkonfirmasi",
    txHash: input.txHash ?? undefined,
    receiptCode: input.receiptCode,
    merchantId: input.merchantId,
    invoiceId: input.invoiceId?.trim() || undefined,
  });
}
