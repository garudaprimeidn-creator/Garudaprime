import { adminDb } from "./firebaseAdmin.js";

type ReceiptLike = {
  uid?: string;
  payerUid?: string;
  merchantId?: string;
};

export async function canAccessPayReceipt(
  requesterUid: string,
  receipt: ReceiptLike,
): Promise<boolean> {
  const payerUid = String(receipt.payerUid ?? receipt.uid ?? "").trim();
  if (payerUid && payerUid === requesterUid) return true;

  const merchantId = String(receipt.merchantId ?? "").trim();
  if (!merchantId) return false;

  const merchantSnap = await adminDb().collection("pay_merchants").doc(merchantId).get();
  if (!merchantSnap.exists) return false;
  const ownerUid = String(merchantSnap.data()?.ownerUid ?? "").trim();
  return ownerUid === requesterUid;
}
