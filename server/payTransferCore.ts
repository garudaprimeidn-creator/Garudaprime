import { FieldValue } from "firebase-admin/firestore";
import { getAddress, isAddress } from "viem";
import { adminDb } from "./firebaseAdmin.js";
import { applyProtocolFeeSenderPays } from "./protocolCore.js";
import { resolveUidFromWalletAddress } from "./walletIdentityCore.js";
import { recordPayHubTransferHistory } from "./payUserHistoryCore.js";
import { relayP2POnChain, relayProtocolFeeOnChain } from "./onChainPayHubAdapter.js";
import { isOnChainWritePrimaryFor, shouldMutateFirestorePayLedger } from "./payHubOnChainWrite.js";
import { assertOnChainPayHubSpendable } from "./payHubOnChainBalance.js";
import { isPayHubOnChainConfigured, shouldShadowWriteOnChain } from "./payHubLedgerMode.js";

const TRANSFERS_COL = "pay_transfers";

const receiptCode = () =>
  `GP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

async function relayGatOnSidra(input: {
  senderUid: string;
  recipientAddress: string;
  netAmountGat: number;
  feeAmountGat: number;
  refId: string;
}): Promise<string | null> {
  const RELAY_FAST_MS = 1_200;
  let onChainTxHash: string | null = null;
  try {
    const relay = await Promise.race([
      relayP2POnChain({
        senderUid: input.senderUid,
        recipientAddress: input.recipientAddress,
        amountGat: input.netAmountGat,
        refId: input.refId,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), RELAY_FAST_MS)),
    ]);
    if (relay?.txHash) onChainTxHash = relay.txHash;
    else {
      void relayP2POnChain({
        senderUid: input.senderUid,
        recipientAddress: input.recipientAddress,
        amountGat: input.netAmountGat,
        refId: input.refId,
      })
        .then((bg) => {
          if (!bg?.txHash) return;
          return adminDb().collection(TRANSFERS_COL)
            .where("refId", "==", input.refId)
            .limit(1)
            .get()
            .then((snap) => {
              if (snap.empty) return;
              return snap.docs[0].ref.set({ onChainTxHash: bg.txHash }, { merge: true });
            });
        })
        .catch(() => undefined);
    }
  } catch (err) {
    void relayP2POnChain({
      senderUid: input.senderUid,
      recipientAddress: input.recipientAddress,
      amountGat: input.netAmountGat,
      refId: input.refId,
    }).catch(() => undefined);
    throw err;
  }
  void relayProtocolFeeOnChain({
    payerUid: input.senderUid,
    feeAmountGat: input.feeAmountGat,
    refId: input.refId,
  }).catch(() => undefined);
  return onChainTxHash;
}

/** Kirim GAT ke alamat eksternal (bukan user GP) via relayer Sidra, tanpa popup dompet. */
async function transferGatExternalOnSidra(
  senderUid: string,
  recipientAddress: string,
  recipientAmount: number,
) {
  const refId = receiptCode();
  const feeResult = await applyProtocolFeeSenderPays({
    uid: senderUid,
    feeType: "transaction",
    recipientAmount,
    refId,
    channel: "onchain",
  });

  const spendable = await assertOnChainPayHubSpendable(senderUid, feeResult.grossAmount);
  const onChainTxHash = await relayGatOnSidra({
    senderUid,
    recipientAddress,
    netAmountGat: feeResult.netAmount,
    feeAmountGat: feeResult.feeAmount,
    refId,
  });

  const transferDoc = await adminDb().collection(TRANSFERS_COL).add({
    senderUid,
    recipientUid: null,
    recipientAddress: recipientAddress.toLowerCase(),
    external: true,
    grossAmount: feeResult.grossAmount,
    netAmount: feeResult.netAmount,
    feeAmount: feeResult.feeAmount,
    feeBps: feeResult.feeBps,
    refId,
    status: "confirmed",
    onChainTxHash,
    ledgerSource: "onchain",
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true as const,
    transferId: transferDoc.id,
    recipientUid: "",
    refId,
    grossAmount: feeResult.grossAmount,
    netAmount: feeResult.netAmount,
    feeAmount: feeResult.feeAmount,
    gatBalance: Math.max(0, spendable.gatBalance - feeResult.grossAmount),
    onChainTxHash,
  };
}

export async function transferPayHubGat(
  senderUid: string,
  recipientAddress: string,
  recipientAmount: number,
) {
  if (!isAddress(recipientAddress, { strict: false })) {
    throw new Error("Invalid recipient address");
  }
  if (!Number.isFinite(recipientAmount) || recipientAmount <= 0) {
    throw new Error("Invalid amount");
  }

  const normalized = getAddress(recipientAddress);
  const recipientUid = await resolveUidFromWalletAddress(normalized);
  if (!recipientUid) {
    if (shouldShadowWriteOnChain() && isPayHubOnChainConfigured()) {
      return transferGatExternalOnSidra(senderUid, normalized, recipientAmount);
    }
    throw new Error("Recipient is not registered on Garuda Prime");
  }
  if (recipientUid === senderUid) {
    throw new Error("Cannot send to yourself");
  }

  const refId = receiptCode();
  const feeResult = await applyProtocolFeeSenderPays({
    uid: senderUid,
    feeType: "transaction",
    recipientAmount,
    refId,
    channel: isOnChainWritePrimaryFor("transfer") ? "onchain" : "offchain",
  });

  const chainPrimary = isOnChainWritePrimaryFor("transfer");
  let onChainTxHash: string | null = null;
  let postTransferBalance: number | null = null;

  if (chainPrimary) {
    const spendable = await assertOnChainPayHubSpendable(senderUid, feeResult.grossAmount);
    postTransferBalance = Math.max(0, spendable.gatBalance - feeResult.grossAmount);
    onChainTxHash = await relayGatOnSidra({
      senderUid,
      recipientAddress: normalized,
      netAmountGat: feeResult.netAmount,
      feeAmountGat: feeResult.feeAmount,
      refId,
    });
  } else if (shouldMutateFirestorePayLedger("transfer")) {
    const db = adminDb();
    const senderRef = db.collection("pay_ledgers").doc(senderUid);
    const recipientRef = db.collection("pay_ledgers").doc(recipientUid);

    await db.runTransaction(async (tx) => {
      const senderSnap = await tx.get(senderRef);
      const recipientSnap = await tx.get(recipientRef);

      const senderBal = senderSnap.exists ? Number(senderSnap.data()?.gatBalance ?? 0) : 0;
      if (senderBal < feeResult.grossAmount) throw new Error("Insufficient GAT balance");

      const recipientBal = recipientSnap.exists ? Number(recipientSnap.data()?.gatBalance ?? 0) : 0;

      tx.set(senderRef, {
        uid: senderUid,
        gatBalance: senderBal - feeResult.grossAmount,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      tx.set(recipientRef, {
        uid: recipientUid,
        gatBalance: recipientBal + feeResult.netAmount,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    const shadowRelay = await relayP2POnChain({
      senderUid,
      recipientAddress: normalized,
      amountGat: feeResult.netAmount,
      refId,
    }).catch(() => null);
    onChainTxHash = shadowRelay?.txHash ?? null;
  }

  const db = adminDb();
  const transferDoc = await db.collection(TRANSFERS_COL).add({
    senderUid,
    recipientUid,
    recipientAddress: normalized.toLowerCase(),
    grossAmount: feeResult.grossAmount,
    netAmount: feeResult.netAmount,
    feeAmount: feeResult.feeAmount,
    feeBps: feeResult.feeBps,
    refId,
    status: "confirmed",
    onChainTxHash,
    ledgerSource: chainPrimary ? "onchain" : "firestore",
    createdAt: FieldValue.serverTimestamp(),
  });

  await recordPayHubTransferHistory({
    senderUid,
    recipientUid,
    recipientAddress: normalized,
    grossAmount: feeResult.grossAmount,
    netAmount: feeResult.netAmount,
    refId,
    txHash: onChainTxHash,
  }).catch(() => undefined);

  const ledger = chainPrimary && postTransferBalance != null
    ? { gatBalance: postTransferBalance }
    : chainPrimary
      ? await import("./payLedgerCore.js").then((m) => m.getPayLedger(senderUid))
      : await (async () => {
        const senderSnap = await db.collection("pay_ledgers").doc(senderUid).get();
        const gatBalance = senderSnap.exists ? Number(senderSnap.data()?.gatBalance ?? 0) : 0;
        return { gatBalance };
      })();

  return {
    ok: true as const,
    transferId: transferDoc.id,
    recipientUid,
    refId,
    grossAmount: feeResult.grossAmount,
    netAmount: feeResult.netAmount,
    feeAmount: feeResult.feeAmount,
    gatBalance: ledger.gatBalance,
    onChainTxHash,
  };
}

export const payTransferErrorStatus = (message: string): number => {
  if (message === "Unauthorized" || message.startsWith("Unauthorized")) return 401;
  if (
    message === "Insufficient GAT balance"
    || message === "Invalid amount"
    || message === "Invalid recipient address"
    || message === "Recipient is not registered on Garuda Prime"
    || message === "Cannot send to yourself"
    || message.includes("Garuda Wallet not linked")
    || message.includes("GAT approval required")
    || message.includes("On-chain transfer failed")
  ) {
    return 400;
  }
  return 500;
};
