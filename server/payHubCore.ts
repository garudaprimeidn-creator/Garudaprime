import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "./firebaseAdmin.js";
import {
  applyProtocolFee,
  applyProtocolFeeSenderPays,
  computeProtocolFeeSenderPays,
} from "./protocolCore.js";
import {
  ensureMerchant,
  creditMerchantBalance,
  resolveMerchantOwnerUid,
  resolveMerchantVaultAddress,
  resolveMerchantIdForSettlement,
  settleOffchainTransfer,
} from "./merchantLedgerCore.js";
import { registerMerchantVaultOnChain } from "./payHubMerchantOnChain.js";
import {
  patchUserTransactionsByReceipt,
  recordPayHubMerchantPayHistory,
  recordPayHubMerchantReceiveHistory,
} from "./payUserHistoryCore.js";
import { relayMerchantPayOnChain, relayProtocolFeeOnChain } from "./onChainPayHubAdapter.js";
import { isOnChainWritePrimaryFor, shouldMutateFirestorePayLedger } from "./payHubOnChainWrite.js";
import { isPayHubOnChainConfigured, shouldReadChainBalance } from "./payHubLedgerMode.js";
import { syncPayLedgerGatFromChain } from "./payLedgerCore.js";
import { assertOnChainPayHubSpendable } from "./payHubOnChainBalance.js";
import {
  computeMerchantServiceFeeSettlement,
} from "./merchantMdrCore.js";

export type PayChannel = "onchain" | "offchain";

export type SettleBody = {
  channel: PayChannel;
  amount: string;
  merchantId: string;
  payerAddress: string;
  /** On-chain vault from scanned QR, authoritative when merchantId is platform default */
  recipientVault?: string;
  txHash?: string;
  /** Merchant invoice number from scanned billing QR */
  invoiceId?: string;
  invoiceNote?: string;
};

export type PayReceiptStatus = "confirmed" | "pending" | "failed";

const registeredMerchantVaults = new Map<string, string>();

const ensureMerchantVaultRegistered = async (merchantId: string, vault: string) => {
  const key = vault.toLowerCase();
  if (registeredMerchantVaults.get(merchantId) === key) return;
  await registerMerchantVaultOnChain(merchantId, vault).catch(() => undefined);
  registeredMerchantVaults.set(merchantId, key);
};

export const friendlyPayHubError = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err);
  if (
    message.includes("RESOURCE_EXHAUSTED")
    || message.toLowerCase().includes("quota exceeded")
  ) {
    return "Layanan sibuk, tunggu 1-2 menit lalu coba lagi";
  }
  if (
    message.includes("insufficient funds")
    || message.includes("exceeds the balance")
    || message.includes("gas * gas fee")
    || message.includes("Saldo SDA tidak cukup")
  ) {
    return "Saldo SDA tidak cukup untuk biaya jaringan Sidra, gas sedang disponsori, coba lagi dalam beberapa detik.";
  }
  if (/insufficient gat balance/i.test(message)) {
    return "Saldo GAT on-chain tidak cukup, segarkan dompet lalu coba lagi.";
  }
  if (/approval required|approve pay hub/i.test(message)) {
    return "Persetujuan GAT diperlukan, buka Dompet dan setujui Pay Hub.";
  }
  if (/sda amount must be|relayer: sda/i.test(message)) {
    return "Gas Sidra sedang disponsori, coba lagi dalam beberapa detik.";
  }
  if (/sidra relay timeout/i.test(message)) {
    return "Pembayaran dikirim, menunggu konfirmasi Sidra Network. Cek riwayat dompet.";
  }
  return message;
};

const parseAmount = (raw: string): number => {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid amount");
  return n;
};


async function mirrorMerchantPayOnChain(input: {
  payerUid: string;
  payerAddress?: string;
  merchantId: string;
  amountGat: number;
  feeAmountGat: number;
  refId: string;
  merchantVaultAddress: string;
}): Promise<{ txHash: string; pending?: boolean } | null> {
  const relay = await relayMerchantPayOnChain({
    payerUid: input.payerUid,
    payerAddress: input.payerAddress,
    merchantId: input.merchantId,
    amountGat: input.amountGat,
    refId: input.refId,
    merchantVaultAddress: input.merchantVaultAddress,
  });
  if (!relay?.txHash) throw new Error("On-chain merchant pay failed");
  void relayProtocolFeeOnChain({
    payerUid: input.payerUid,
    payerAddress: input.payerAddress,
    feeAmountGat: input.feeAmountGat,
    refId: input.refId,
  }).catch(() => undefined);
  return { txHash: relay.txHash, pending: relay.pending };
}

export const verifyBearerToken = async (header?: string) => {
  if (!header?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = header.slice(7);
  return adminAuth().verifyIdToken(token);
};

export const settlePayHub = async (body: SettleBody, uid: string) => {
  if (!body?.channel || !body.amount || !body.merchantId || !body.payerAddress) {
    throw new Error("Missing required fields");
  }

  body.merchantId = await resolveMerchantIdForSettlement(
    body.merchantId,
    body.recipientVault,
  );

  const payerHintFromClient = body.payerAddress.trim();

  const chainMerchant =
    isOnChainWritePrimaryFor("merchant")
    || (body.channel === "onchain" && isPayHubOnChainConfigured());
  const usePayHubRelay = chainMerchant && !body.txHash;
  const recipientAmount = parseAmount(body.amount);
  const code = `GP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const merchant = await ensureMerchant(body.merchantId);

  let feeResult: Awaited<ReturnType<typeof computeProtocolFeeSenderPays>>;
  if (usePayHubRelay) {
    const settlement = await computeMerchantServiceFeeSettlement(recipientAmount);
    feeResult = {
      grossAmount: settlement.grossGat,
      feeAmount: settlement.feeGat,
      netAmount: settlement.netGat,
      feeBps: settlement.feeBps,
    };
  } else if (body.channel === "offchain") {
    feeResult = await applyProtocolFeeSenderPays({
      uid,
      feeType: "transaction",
      recipientAmount,
      refId: code,
      channel: body.channel,
    });
  } else {
    feeResult = await applyProtocolFee({
      uid,
      feeType: "swap",
      grossAmount: recipientAmount,
      refId: code,
      channel: body.channel,
    });
  }

  const totalDeduct = feeResult.grossAmount;

  let onChainTxHash: string | null = body.txHash ?? null;
  let onChainPending = false;

  if (usePayHubRelay) {
    let merchantForCredit = merchant;
    let ownerUid = resolveMerchantOwnerUid(merchantForCredit);
    if (!ownerUid && body.merchantId.startsWith("GP-USR-")) {
      const refreshed = await adminDb().collection("pay_merchants").doc(body.merchantId).get();
      if (refreshed.exists) {
        merchantForCredit = refreshed.data() as typeof merchant;
        ownerUid = resolveMerchantOwnerUid(merchantForCredit);
      }
      if (!ownerUid) {
        throw new Error("Merchant belum terhubung ke Pay Hub. Minta penerima membuka Merchant Center sekali.");
      }
    }
    const [spendable, vault] = await Promise.all([
      assertOnChainPayHubSpendable(uid, totalDeduct, payerHintFromClient, { deferApproval: usePayHubRelay }),
      resolveMerchantVaultAddress(merchantForCredit, body.merchantId),
    ]);
    body.payerAddress = spendable.walletAddress;

    if (!vault) {
      throw new Error(
        body.merchantId.startsWith("GP-USR-")
          ? "Dompet vault merchant belum terhubung. Minta merchant membuka Merchant Center sekali."
          : "Dompet vault merchant belum terhubung. Hubungkan merchant di Merchant Center atau hubungi dukungan.",
      );
    }
    void ensureMerchantVaultRegistered(body.merchantId, vault).catch(() => undefined);

    const chainInput = {
      payerUid: uid,
      payerAddress: body.payerAddress,
      merchantId: body.merchantId,
      amountGat: feeResult.netAmount,
      feeAmountGat: feeResult.feeAmount,
      refId: code,
      merchantVaultAddress: vault,
    };

    const onChainPrimary = isOnChainWritePrimaryFor("merchant");
    const mutateLedger = shouldMutateFirestorePayLedger("merchant");

    if (!onChainPrimary && mutateLedger) {
      try {
        await settleOffchainTransfer(
          uid,
          body.merchantId,
          merchantForCredit,
          totalDeduct,
          feeResult.netAmount,
          { forceLedger: true },
        );
      } catch (ledgerErr) {
        const msg = ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr);
        if (!msg.includes("Insufficient GAT balance")) {
          throw new Error(friendlyPayHubError(ledgerErr));
        }
      }
    } else if (!onChainPrimary) {
      try {
        await creditMerchantBalance(body.merchantId, merchantForCredit, feeResult.netAmount);
      } catch (err) {
        throw new Error(friendlyPayHubError(err));
      }
    }

    const RELAY_AWAIT_MS = onChainPrimary ? 22_000 : 10_000;
    try {
      const relayResult = await Promise.race([
        mirrorMerchantPayOnChain(chainInput),
        new Promise<null>((_, reject) => {
          setTimeout(() => reject(new Error("Sidra relay timeout")), RELAY_AWAIT_MS);
        }),
      ]);
      if (relayResult?.txHash) {
        onChainTxHash = relayResult.txHash;
        onChainPending = Boolean(relayResult.pending);
      }
    } catch (relayErr) {
      const relayMsg = friendlyPayHubError(relayErr);
      if (onChainPrimary) {
        throw new Error(
          relayMsg.includes("menunggu konfirmasi") || relayMsg.includes("disponsori")
            ? relayMsg
            : "Transfer GAT on-chain gagal, periksa saldo & coba lagi",
        );
      }
      void mirrorMerchantPayOnChain(chainInput)
        .then(async (result) => {
          if (!result?.txHash) return;
          const snap = await adminDb().collection("pay_receipts")
            .where("receiptCode", "==", code)
            .limit(1)
            .get();
          if (!snap.empty) {
            await snap.docs[0].ref.set({
              txHash: result.txHash,
              onChainTxHash: result.txHash,
              status: result.pending ? "pending" : "confirmed",
            }, { merge: true });
          }
          await patchUserTransactionsByReceipt(code, {
            txHash: result.txHash,
            feeAmount: feeResult.feeAmount,
          }).catch(() => undefined);
        })
        .catch(() => undefined);
      console.warn("[pay/settle] Sidra relay deferred", relayErr);
    }

    if (onChainPrimary && !onChainTxHash) {
      throw new Error("Transfer GAT on-chain gagal, coba lagi dalam beberapa saat");
    }

    if (!onChainTxHash) {
      void mirrorMerchantPayOnChain(chainInput)
        .then(async (result) => {
          if (!result?.txHash) return;
          const snap = await adminDb().collection("pay_receipts")
            .where("receiptCode", "==", code)
            .limit(1)
            .get();
          if (!snap.empty) {
            await snap.docs[0].ref.set({
              txHash: result.txHash,
              onChainTxHash: result.txHash,
              status: result.pending ? "pending" : "confirmed",
            }, { merge: true });
          }
          await patchUserTransactionsByReceipt(code, {
            txHash: result.txHash,
            feeAmount: feeResult.feeAmount,
          }).catch(() => undefined);
        })
        .catch(() => undefined);
    }
  } else if (body.channel === "offchain") {
    await settleOffchainTransfer(uid, body.merchantId, merchant, totalDeduct, feeResult.netAmount);
  }

  const status: PayReceiptStatus = (() => {
    if (usePayHubRelay && isOnChainWritePrimaryFor("merchant") && !onChainTxHash) return "pending";
    if (onChainPending) return "pending";
    if (usePayHubRelay || body.txHash || body.channel === "offchain") return "confirmed";
    return "pending";
  })();

  const invoiceId = body.invoiceId?.trim() || undefined;
  const invoiceNote = body.invoiceNote?.trim() || undefined;

  const receipt = {
    uid,
    channel: body.channel,
    source: "qr_pay",
    merchantId: body.merchantId,
    merchantName: merchant.name,
    amount: String(feeResult.netAmount),
    feeAmount: feeResult.feeAmount,
    feeBps: feeResult.feeBps,
    grossAmount: String(feeResult.grossAmount),
    token: "GAT" as const,
    payerAddress: body.payerAddress,
    status,
    receiptCode: code,
    txHash: onChainTxHash,
    onChainTxHash,
    merchantCredited: usePayHubRelay || body.channel === "offchain",
    ...(invoiceId ? { invoiceId } : {}),
    ...(invoiceNote ? { invoiceNote } : {}),
    createdAt: FieldValue.serverTimestamp(),
  };

  let receiptId = code;
  try {
    const doc = await adminDb().collection("pay_receipts").add(receipt);
    receiptId = doc.id;
  } catch (err) {
    const quota = friendlyPayHubError(err).startsWith("Layanan sibuk");
    const settled = usePayHubRelay || body.channel === "offchain" || Boolean(onChainTxHash);
    if (!settled && !quota) throw err;
    /* merchant credited or Firestore throttled, receipt write is best-effort */
  }

  if ((usePayHubRelay || body.channel === "offchain") && status === "confirmed") {
    const receiveOwnerUid = resolveMerchantOwnerUid(merchant);
    await recordPayHubMerchantPayHistory({
      payerUid: uid,
      merchantName: merchant.name,
      merchantId: body.merchantId,
      grossAmount: feeResult.grossAmount,
      receiptCode: code,
      txHash: onChainTxHash,
      invoiceId,
    }).catch(() => undefined);
    if (receiveOwnerUid) {
      await recordPayHubMerchantReceiveHistory({
        ownerUid: receiveOwnerUid,
        payerAddress: body.payerAddress,
        merchantName: merchant.name,
        merchantId: body.merchantId,
        grossAmount: feeResult.grossAmount,
        netAmount: feeResult.netAmount,
        feeAmount: feeResult.feeAmount,
        receiptCode: code,
        txHash: onChainTxHash,
        invoiceId,
      }).catch(() => undefined);
    }
  }

  if (onChainTxHash && shouldReadChainBalance()) {
    void syncPayLedgerGatFromChain(uid).catch(() => undefined);
    const receiveOwnerUid = resolveMerchantOwnerUid(merchant);
    if (receiveOwnerUid && receiveOwnerUid !== uid) {
      void syncPayLedgerGatFromChain(receiveOwnerUid).catch(() => undefined);
    }
  }

  return {
    receipt: {
      id: receiptId,
      ...receipt,
      createdAt: Date.now(),
    },
    simulated: false,
  };
};

export const fetchReceiptByCode = async (code: string) => {
  const snap = await adminDb().collection("pay_receipts")
    .where("receiptCode", "==", code)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc = snap.docs[0];
  let data = { id: doc.id, ...doc.data() } as Record<string, unknown> & {
    id: string;
    txHash?: string | null;
    onChainTxHash?: string | null;
  };

  const existingHash = String(data.txHash ?? data.onChainTxHash ?? "").trim();
  if (!existingHash) {
    const jobSnap = await adminDb().collection("pay_relayer_jobs")
      .where("refId", "==", code)
      .limit(1)
      .get();
    const jobHash = String(jobSnap.docs[0]?.data()?.txHash ?? "").trim();
    if (jobHash) {
      data = { ...data, txHash: jobHash, onChainTxHash: jobHash };
      void doc.ref.set({ txHash: jobHash, onChainTxHash: jobHash }, { merge: true }).catch(() => undefined);
      void patchUserTransactionsByReceipt(code, {
        txHash: jobHash,
        feeAmount: Number(data.feeAmount ?? 0) || undefined,
      }).catch(() => undefined);
    }
  }

  return data;
};

export const payHubErrorStatus = (message: string): number => {
  if (message === "Unauthorized" || message.startsWith("Unauthorized")) return 401;
  if (
    message.includes("Insufficient GAT balance")
    || message.includes("insufficient funds")
    || message.includes("exceeds the balance")
    || message.includes("gas * gas fee")
  ) {
    if (
      message.includes("insufficient funds")
      || message.includes("exceeds the balance")
      || message.includes("gas * gas fee")
    ) {
      return "Saldo SDA tidak cukup untuk biaya jaringan Sidra, gas sedang disponsori, coba lagi.";
    }
  }
  if (
    message === "Insufficient GAT balance"
    || message === "Merchant not found"
    || message.includes("On-chain merchant pay failed")
    || message.includes("GAT approval required")
    || message.includes("Garuda Wallet not linked")
    || message.startsWith("Merchant not registered")
    || message === "Missing required fields"
    || message === "Invalid amount"
    || message.startsWith("Merchant belum terhubung")
    ||     message.startsWith("Dompet vault merchant belum terhubung")
    || message.startsWith("Layanan sibuk")
    || message.includes("Sign challenge")
    || message.includes("Transaction from address mismatch")
    || message.includes("Garuda payment direct debit not enabled")
    || message.includes("Relayer private key not configured")
    || message.includes("On-chain Pay Hub not configured")
    || message.includes("Insufficient GAT balance")
    || message.includes("GAT approval required")
    || message.includes("Garuda Wallet not linked")
    || message.includes("Saldo GAT ada di dompet lama")
    || message.includes("Garuda wallet not found")
    || message.includes("Wallet address does not belong")
  ) return 503;
  return 500;
};
