import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

type PayChannel = "onchain" | "offchain";

type SettleBody = {
  channel: PayChannel;
  amount: string;
  merchantId: string;
  payerAddress: string;
  txHash?: string;
};

const db = getFirestore();

type MerchantDoc = {
  name: string;
  verified?: boolean;
  walletAddress?: string | null;
  ownerUid?: string | null;
  gatBalance?: number;
};

const DEFAULT_MERCHANT: MerchantDoc & { merchantId: string } = {
  merchantId: "GP-MRT-2847",
  name: "Garuda Halal Mart",
  verified: true,
  walletAddress: null,
  ownerUid: process.env.PAY_HUB_MERCHANT_OWNER_UID?.trim() || null,
  gatBalance: 0,
};

const receiptCode = () =>
  `GP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const parseAmount = (raw: string): number => {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid amount");
  return n;
};

const verifyAuth = async (header?: string) => {
  if (!header?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = header.slice(7);
  return getAuth().verifyIdToken(token);
};

const ensureMerchant = async (merchantId: string): Promise<MerchantDoc> => {
  const ref = db.collection("pay_merchants").doc(merchantId);
  const snap = await ref.get();
  if (snap.exists) return snap.data() as MerchantDoc;

  if (merchantId === DEFAULT_MERCHANT.merchantId) {
    const { merchantId: _id, ...seed } = DEFAULT_MERCHANT;
    await ref.set({ ...seed, createdAt: FieldValue.serverTimestamp() });
    return seed;
  }

  throw new Error("Merchant not found");
};

const settleOffchainTransfer = async (
  payerUid: string,
  merchantId: string,
  merchant: MerchantDoc,
  grossAmount: number,
  netAmount: number,
) => {
  const payerRef = db.collection("pay_ledgers").doc(payerUid);
  const merchantRef = db.collection("pay_merchants").doc(merchantId);

  await db.runTransaction(async (tx) => {
    const ownerUid = merchant.ownerUid?.trim() || null;
    const ownerRef = ownerUid ? db.collection("pay_ledgers").doc(ownerUid) : null;

    const payerSnap = await tx.get(payerRef);
    const ownerSnap = ownerRef ? await tx.get(ownerRef) : null;
    const merchantSnap = ownerRef ? null : await tx.get(merchantRef);

    const payerBal = payerSnap.exists ? Number(payerSnap.data()?.gatBalance ?? 0) : 0;
    if (payerBal < grossAmount) throw new Error("Insufficient GAT balance");

    tx.set(payerRef, {
      uid: payerUid,
      gatBalance: payerBal - grossAmount,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (ownerRef && ownerUid) {
      const ownerBal = ownerSnap?.exists ? Number(ownerSnap.data()?.gatBalance ?? 0) : 0;
      tx.set(ownerRef, {
        uid: ownerUid,
        gatBalance: ownerBal + netAmount,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(merchantRef, {
        totalReceived: FieldValue.increment(netAmount),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return;
    }

    const merchantBal = merchantSnap?.exists ? Number(merchantSnap.data()?.gatBalance ?? 0) : 0;
    tx.set(merchantRef, {
      gatBalance: merchantBal + netAmount,
      totalReceived: FieldValue.increment(netAmount),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
};

export const payHubApi = onRequest(
  { cors: true, region: "asia-southeast1" },
  async (req, res) => {
    try {
      const path = req.path.replace(/^\//, "");

      if (req.method === "GET" && (path === "health" || path === "")) {
        res.json({ ok: true, service: "Garuda Pay Hub", phase: 1 });
        return;
      }

      if (req.method === "GET" && path.startsWith("pay/receipt/")) {
        const code = path.split("/")[2];
        const snap = await db.collection("pay_receipts")
          .where("receiptCode", "==", code)
          .limit(1)
          .get();

        if (snap.empty) {
          res.status(404).json({ error: "Receipt not found" });
          return;
        }

        const data = snap.docs[0].data();
        res.json({ receipt: { id: snap.docs[0].id, ...data } });
        return;
      }

      if (req.method === "POST" && path === "pay/settle") {
        const decoded = await verifyAuth(req.headers.authorization);
        const body = req.body as SettleBody;

        if (!body?.channel || !body.amount || !body.merchantId || !body.payerAddress) {
          res.status(400).json({ error: "Missing required fields" });
          return;
        }

        const amount = parseAmount(body.amount);
        const merchant = await ensureMerchant(body.merchantId);
        const code = receiptCode();

        if (body.channel === "offchain") {
          await settleOffchainTransfer(decoded.uid, body.merchantId, merchant, amount, amount);
        }

        const status = body.channel === "onchain" && !body.txHash ? "pending" : "confirmed";

        const receipt = {
          uid: decoded.uid,
          channel: body.channel,
          merchantId: body.merchantId,
          merchantName: merchant.name,
          amount: String(amount),
          token: "GAT",
          payerAddress: body.payerAddress,
          status,
          receiptCode: code,
          txHash: body.txHash ?? null,
          createdAt: FieldValue.serverTimestamp(),
        };

        const doc = await db.collection("pay_receipts").add(receipt);

        res.json({
          receipt: {
            id: doc.id,
            ...receipt,
            createdAt: Date.now(),
          },
          simulated: false,
        });
        return;
      }

      res.status(404).json({ error: "Not found" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Internal error";
      const status = message === "Unauthorized" || message.startsWith("Unauthorized")
        ? 401
        : message === "Insufficient GAT balance" || message === "Merchant not found"
          ? 400
          : 500;
      res.status(status).json({ error: message });
    }
  },
);
