import { adminDb } from "./firebaseAdmin.js";
import { appendUserTransaction } from "./payUserHistoryCore.js";
import { appendUserInbox } from "./userInboxCore.js";
import { resolveUidFromWalletAddress, resolveWalletDisplayName } from "./walletIdentityCore.js";

const TRANSACTIONS_COL = "user_transactions";

const shortAddr = (address: string) => {
  const a = address.trim();
  if (a.length < 12) return a;
  return `${a.slice(0, 8)}…${a.slice(-4)}`;
};

async function recipientReceiveExists(recipientUid: string, txHash: string): Promise<boolean> {
  const hash = txHash.trim().toLowerCase();
  if (!hash) return false;
  const snap = await adminDb()
    .collection(TRANSACTIONS_COL)
    .where("uid", "==", recipientUid)
    .where("txHash", "==", hash)
    .limit(5)
    .get();
  return snap.docs.some((doc) => String(doc.data().type ?? "").toLowerCase() === "receive");
}

export async function notifyWalletTransferRecipient(input: {
  senderUid: string;
  senderAddress?: string | null;
  recipientAddress: string;
  amount: number;
  symbol: "GAT" | "SDA";
  txHash: string;
}): Promise<{ notified: boolean; recipientUid?: string; duplicate?: boolean }> {
  const txHash = input.txHash?.trim();
  if (!txHash) throw new Error("txHash required");

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount");

  const symbol = input.symbol === "SDA" ? "SDA" : "GAT";
  const recipientUid = await resolveUidFromWalletAddress(input.recipientAddress);
  if (!recipientUid) {
    return { notified: false };
  }

  if (await recipientReceiveExists(recipientUid, txHash)) {
    return { notified: true, recipientUid, duplicate: true };
  }

  const senderAddress = input.senderAddress?.trim() || "";
  const senderLabel = senderAddress
    ? (await resolveWalletDisplayName(senderAddress)) ?? shortAddr(senderAddress)
    : "Pengguna Garuda Prime";

  const time = new Date().toISOString();
  const amountLabel = `+${amount.toFixed(symbol === "GAT" ? 4 : 6)} ${symbol}`;

  const txId = await appendUserTransaction(recipientUid, {
    type: "receive",
    amount: amountLabel,
    addr: senderLabel,
    counterpartyWallet: senderAddress || undefined,
    time,
    usd: `+$${amount.toFixed(2)}`,
    status: "Terkonfirmasi",
    txHash,
  });

  await appendUserInbox(recipientUid, {
    type: "receive",
    title: "Dana Diterima",
    body: `${amountLabel} diterima dari ${senderLabel}.`,
    action: { type: "transaction", txId },
  });

  return { notified: true, recipientUid };
}
