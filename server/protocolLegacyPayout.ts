import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import { resolvePrimaryWalletForUid } from "./chainBalanceService.js";
import { sendGatOnSidra, isPayHubWithdrawConfigured } from "./payLedgerCore.js";
import { shouldMutateFirestorePayLedger } from "./payHubOnChainWrite.js";
import { applyProtocolFee, type ProtocolSettleAction } from "./protocolCore.js";

async function creditLedgerIfEnabled(uid: string, amount: number) {
  if (amount <= 0 || !shouldMutateFirestorePayLedger("protocol")) return;
  const db = adminDb();
  const ref = db.collection("pay_ledgers").doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const balance = snap.exists ? Number(snap.data()?.gatBalance ?? 0) : 0;
    tx.set(
      ref,
      {
        uid,
        gatBalance: balance + amount,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

const SETTLEMENTS_COL = "protocol_settlements";

const DEPOSIT_ACTION: Partial<Record<ProtocolSettleAction, ProtocolSettleAction>> = {
  invest_redeem: "invest_deposit",
  unstake: "stake",
};

export function legacyCreditRefId(positionRefId: string, action: "invest_redeem" | "unstake"): string {
  return `${positionRefId}:${action}`;
}

async function assertOpenLegacyDeposit(
  uid: string,
  positionRefId: string,
  depositAction: "invest_deposit" | "stake",
) {
  const db = adminDb();
  const depositSnap = await db.collection(SETTLEMENTS_COL).doc(positionRefId).get();
  if (!depositSnap.exists) throw new Error("Legacy position not found");
  const deposit = depositSnap.data()!;
  if (deposit.uid !== uid) throw new Error("Settlement mismatch");
  if (deposit.action !== depositAction) throw new Error("Invalid legacy position");
  if (deposit.source === "onchain") {
    throw new Error("On-chain positions must be redeemed from wallet");
  }
  if (deposit.redeemedAt || deposit.releasedAt) {
    throw new Error("Position already closed");
  }
}

async function recordLegacyCreditSettlement(input: {
  creditRefId: string;
  positionRefId: string;
  uid: string;
  action: "invest_redeem" | "unstake";
  grossAmountGat: number;
  netAmountGat: number;
  feeAmountGat: number;
  walletAddress: string;
  payoutTxHash?: string;
}) {
  const db = adminDb();
  const creditRef = db.collection(SETTLEMENTS_COL).doc(input.creditRefId);
  const depositRef = db.collection(SETTLEMENTS_COL).doc(input.positionRefId);

  await db.runTransaction(async (tx) => {
    const [creditSnap, depositSnap] = await Promise.all([tx.get(creditRef), tx.get(depositRef)]);
    if (creditSnap.exists) throw new Error("Position already redeemed");
    if (!depositSnap.exists) throw new Error("Legacy position not found");

    const deposit = depositSnap.data()!;
    if (deposit.uid !== input.uid) throw new Error("Settlement mismatch");
    if (deposit.redeemedAt || deposit.releasedAt) throw new Error("Position already closed");

    tx.set(creditRef, {
      uid: input.uid,
      action: input.action,
      grossAmountGat: input.grossAmountGat,
      netAmountGat: input.netAmountGat,
      feeAmountGat: input.feeAmountGat,
      positionRefId: input.positionRefId,
      source: "legacy_payout",
      channel: shouldMutateFirestorePayLedger("protocol") ? "ledger" : "onchain",
      walletAddress: input.walletAddress.toLowerCase(),
      payoutTxHash: input.payoutTxHash ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.set(
      depositRef,
      {
        redeemedAt: FieldValue.serverTimestamp(),
        releasedAt: FieldValue.serverTimestamp(),
        closedBy: input.action,
        payoutTxHash: input.payoutTxHash ?? null,
      },
      { merge: true },
    );
  });
}

async function resolvePayoutWallet(uid: string, walletAddress?: string): Promise<string> {
  const normalized = walletAddress?.trim().toLowerCase();
  if (normalized && /^0x[a-f0-9]{40}$/.test(normalized)) return normalized;

  const primary = await resolvePrimaryWalletForUid(uid);
  if (primary?.startsWith("0x")) return primary.toLowerCase();

  throw new Error("Wallet address required for legacy payout");
}

export async function settleLegacyProtocolCredit(input: {
  uid: string;
  action: "invest_redeem" | "unstake";
  grossAmountGat: number;
  positionRefId: string;
  netAmountGat: number;
  feeAmountGat: number;
  walletAddress?: string;
}) {
  const depositAction = DEPOSIT_ACTION[input.action];
  if (!depositAction) throw new Error("Invalid legacy credit action");

  await assertOpenLegacyDeposit(input.uid, input.positionRefId, depositAction);

  const wallet = await resolvePayoutWallet(input.uid, input.walletAddress);
  const creditRefId = legacyCreditRefId(input.positionRefId, input.action);

  let payoutTxHash: string | undefined;
  if (shouldMutateFirestorePayLedger("protocol")) {
    await creditLedgerIfEnabled(input.uid, input.netAmountGat);
  } else {
    if (!isPayHubWithdrawConfigured()) {
      throw new Error("On-chain legacy payout is not configured on server");
    }
    if (input.netAmountGat > 0) {
      payoutTxHash = await sendGatOnSidra(wallet, input.netAmountGat);
    }
  }

  await recordLegacyCreditSettlement({
    creditRefId,
    positionRefId: input.positionRefId,
    uid: input.uid,
    action: input.action,
    grossAmountGat: input.grossAmountGat,
    netAmountGat: input.netAmountGat,
    feeAmountGat: input.feeAmountGat,
    walletAddress: wallet,
    payoutTxHash,
  });

  return {
    action: input.action,
    refId: input.positionRefId,
    creditRefId,
    grossAmount: input.grossAmountGat,
    feeAmount: input.feeAmountGat,
    netAmount: input.netAmountGat,
    payoutTxHash,
    payoutWallet: wallet,
    channel: shouldMutateFirestorePayLedger("protocol") ? "ledger" as const : "onchain" as const,
  };
}

export async function releaseLegacyInvestPosition(input: {
  uid: string;
  positionRefId: string;
  grossAmountGat: number;
  walletAddress?: string;
}) {
  const feeResult = await applyProtocolFee({
    uid: input.uid,
    feeType: "withdraw",
    grossAmount: input.grossAmountGat,
    refId: input.positionRefId,
    channel: "offchain",
  });
  const legacy = await settleLegacyProtocolCredit({
    uid: input.uid,
    action: "invest_redeem",
    grossAmountGat: input.grossAmountGat,
    positionRefId: input.positionRefId,
    netAmountGat: feeResult.netAmount,
    feeAmountGat: feeResult.feeAmount,
    walletAddress: input.walletAddress,
  });
  return { ...feeResult, ...legacy, ok: true as const };
}

export async function releaseLegacyStakePosition(input: {
  uid: string;
  positionRefId: string;
  grossAmountGat: number;
  walletAddress?: string;
}) {
  const feeResult = await applyProtocolFee({
    uid: input.uid,
    feeType: "withdraw",
    grossAmount: input.grossAmountGat,
    refId: input.positionRefId,
    channel: "offchain",
  });
  const legacy = await settleLegacyProtocolCredit({
    uid: input.uid,
    action: "unstake",
    grossAmountGat: input.grossAmountGat,
    positionRefId: input.positionRefId,
    netAmountGat: feeResult.netAmount,
    feeAmountGat: feeResult.feeAmount,
    walletAddress: input.walletAddress,
  });
  return { ...feeResult, ...legacy, ok: true as const };
}

export async function getLegacyPositionSummary(uid: string) {
  const db = adminDb();
  const snap = await db
    .collection(SETTLEMENTS_COL)
    .where("uid", "==", uid)
    .limit(200)
    .get()
    .catch(() => null);

  let openInvest = 0;
  let openStake = 0;

  for (const doc of snap?.docs ?? []) {
    const data = doc.data();
    if (data.source === "onchain") continue;
    if (data.redeemedAt || data.releasedAt) continue;
    if (data.action === "invest_deposit") openInvest += 1;
    if (data.action === "stake") openStake += 1;
  }

  return { openInvest, openStake, openTotal: openInvest + openStake };
}
