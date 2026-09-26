import { FieldValue } from "firebase-admin/firestore";
import {
  DEFAULT_DISTRIBUTION_BPS,
  DEFAULT_FEE_RATES_BPS,
  type DistributionBps,
  type FeeRatesBps,
  type FeeType,
  computeFeeAmount,
} from "../src/lib/protocol/feeTypes.js";
import { getCommunityProgramConfig } from "./platformProgramsCore.js";
import { settleCommunityContribution } from "./communityFundsCore.js";
import { lockSdaStakeOnChain, unlockSdaStake } from "./sdaStakingCore.js";
import { adminDb } from "./firebaseAdmin.js";
import { creditMarketMerchantSplits, type MarketMerchantSplit } from "./merchantLedgerCore.js";
import { isOnChainWritePrimaryFor, shouldMutateFirestorePayLedger } from "./payHubOnChainWrite.js";
import { assertOnChainPayHubSpendable } from "./payHubOnChainBalance.js";
import { relayProtocolFeeOnChain } from "./onChainPayHubAdapter.js";
import { verifyGatDepositTransfer } from "./payLedgerCore.js";

const CONFIG_DOC = "platform_config/fees";
const FEE_LEDGER = "fee_ledger";
const TREASURY_LEDGER = "protocol_treasury/ledger";
const REFERRAL_COL = "referrals";
const GOLD_RESERVE = "gold_reserves";
const INSURANCE_FUND = "insurance_fund/main";
const AUDIT_COL = "protocol_audits";

export type FeeConfigDoc = {
  ratesBps: FeeRatesBps;
  distributionBps: DistributionBps;
  updatedAt?: FirebaseFirestore.Timestamp | string;
};

let feeConfigCache: { at: number; value: FeeConfigDoc & { source: string } } | null = null;
const FEE_CONFIG_TTL_MS = 60_000;

export async function getFeeConfig(): Promise<FeeConfigDoc & { source: string }> {
  const now = Date.now();
  if (feeConfigCache && now - feeConfigCache.at < FEE_CONFIG_TTL_MS) {
    return feeConfigCache.value;
  }

  const db = adminDb();
  const snap = await db.doc(CONFIG_DOC).get();
  const value = !snap.exists
    ? {
      ratesBps: DEFAULT_FEE_RATES_BPS,
      distributionBps: DEFAULT_DISTRIBUTION_BPS,
      source: "default",
    }
    : (() => {
      const d = snap.data() as FeeConfigDoc;
      return {
        ratesBps: { ...DEFAULT_FEE_RATES_BPS, ...d.ratesBps },
        distributionBps: { ...DEFAULT_DISTRIBUTION_BPS, ...d.distributionBps },
        updatedAt: d.updatedAt,
        source: "firestore",
      };
    })();

  feeConfigCache = { at: now, value };
  return value;
}

/** Fee math only, no Firestore (on-chain merchant pay uses default/cache). */
export function computeProtocolFeeSenderPaysLocal(input: {
  feeType: FeeType;
  recipientAmount: number;
  feeBps?: number;
}): ApplyFeeResult {
  const feeBps = input.feeBps ?? DEFAULT_FEE_RATES_BPS[input.feeType] ?? 0;
  const netAmount = input.recipientAmount;
  const feeAmount = computeFeeAmount(netAmount, feeBps);
  const grossAmount = netAmount + feeAmount;
  return { grossAmount, feeAmount, netAmount, feeBps };
}

/** Fee math only, no Firestore writes (on-chain merchant pay). */
export async function computeProtocolFeeSenderPays(input: {
  feeType: FeeType;
  recipientAmount: number;
}): Promise<ApplyFeeResult> {
  try {
    const config = await getFeeConfig();
    return computeProtocolFeeSenderPaysLocal({
      feeType: input.feeType,
      recipientAmount: input.recipientAmount,
      feeBps: config.ratesBps[input.feeType] ?? 0,
    });
  } catch {
    return computeProtocolFeeSenderPaysLocal(input);
  }
}

const shouldRecordProtocolFeeInFirestore = (): boolean =>
  !isOnChainWritePrimaryFor("protocol");

export async function updateFeeConfig(
  ratesBps: Partial<FeeRatesBps>,
  distributionBps?: Partial<DistributionBps>,
) {
  const db = adminDb();
  await db.doc(CONFIG_DOC).set(
    {
      ratesBps: { ...DEFAULT_FEE_RATES_BPS, ...ratesBps },
      distributionBps: { ...DEFAULT_DISTRIBUTION_BPS, ...distributionBps },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export type ApplyFeeInput = {
  uid: string;
  feeType: FeeType;
  grossAmount: number;
  refId: string;
  channel?: string;
};

export type ApplyFeeResult = {
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  feeBps: number;
};

export async function applyProtocolFee(input: ApplyFeeInput): Promise<ApplyFeeResult> {
  const config = await getFeeConfig();
  const feeBps = config.ratesBps[input.feeType] ?? 0;
  const feeAmount = computeFeeAmount(input.grossAmount, feeBps);
  const netAmount = input.grossAmount - feeAmount;

  if (feeAmount <= 0) {
    return { grossAmount: input.grossAmount, feeAmount: 0, netAmount: input.grossAmount, feeBps };
  }

  const db = adminDb();
  const dist = config.distributionBps;

  await db.runTransaction(async (tx) => {
    const treasuryRef = db.doc(TREASURY_LEDGER);
    const treasurySnap = await tx.get(treasuryRef);
    const buckets = (treasurySnap.data()?.buckets ?? {}) as Record<string, number>;

    const bucketKeys = ["main", "validator", "referral", "burn", "liquidity", "insurance", "autoDistribution"] as const;
    const distValues = [
      dist.main, dist.validator, dist.referral, dist.burn,
      dist.liquidity, dist.insurance, dist.autoDistribution,
    ];

    let remaining = feeAmount;
    for (let i = 0; i < bucketKeys.length - 1; i++) {
      const share = (feeAmount * distValues[i]) / 10_000;
      if (share > 0) {
        buckets[bucketKeys[i]] = (buckets[bucketKeys[i]] ?? 0) + share;
        remaining -= share;
      }
    }
    buckets.autoDistribution = (buckets.autoDistribution ?? 0) + remaining;

    tx.set(treasuryRef, {
      buckets,
      totalCollected: FieldValue.increment(feeAmount),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    tx.set(db.collection(FEE_LEDGER).doc(), {
      uid: input.uid,
      feeType: input.feeType,
      grossAmount: input.grossAmount,
      feeAmount,
      netAmount,
      feeBps,
      refId: input.refId,
      channel: input.channel ?? "offchain",
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { grossAmount: input.grossAmount, feeAmount, netAmount, feeBps };
}

/** Fee charged to sender on top, recipient gets the full recipientAmount. */
export async function applyProtocolFeeSenderPays(input: {
  uid: string;
  feeType: FeeType;
  recipientAmount: number;
  refId: string;
  channel?: string;
}): Promise<ApplyFeeResult> {
  const { grossAmount, feeAmount, netAmount, feeBps } = await computeProtocolFeeSenderPays({
    feeType: input.feeType,
    recipientAmount: input.recipientAmount,
  });

  if (feeAmount <= 0 || !shouldRecordProtocolFeeInFirestore()) {
    return { grossAmount, feeAmount, netAmount, feeBps };
  }

  const config = await getFeeConfig();
  const db = adminDb();
  const dist = config.distributionBps;

  await db.runTransaction(async (tx) => {
    const treasuryRef = db.doc(TREASURY_LEDGER);
    const treasurySnap = await tx.get(treasuryRef);
    const buckets = (treasurySnap.data()?.buckets ?? {}) as Record<string, number>;

    const bucketKeys = ["main", "validator", "referral", "burn", "liquidity", "insurance", "autoDistribution"] as const;
    const distValues = [
      dist.main, dist.validator, dist.referral, dist.burn,
      dist.liquidity, dist.insurance, dist.autoDistribution,
    ];

    let remaining = feeAmount;
    for (let i = 0; i < bucketKeys.length - 1; i++) {
      const share = (feeAmount * distValues[i]) / 10_000;
      if (share > 0) {
        buckets[bucketKeys[i]] = (buckets[bucketKeys[i]] ?? 0) + share;
        remaining -= share;
      }
    }
    buckets.autoDistribution = (buckets.autoDistribution ?? 0) + remaining;

    tx.set(treasuryRef, {
      buckets,
      totalCollected: FieldValue.increment(feeAmount),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    tx.set(db.collection(FEE_LEDGER).doc(), {
      uid: input.uid,
      feeType: input.feeType,
      grossAmount,
      feeAmount,
      netAmount,
      feeBps,
      feeMode: "sender_pays",
      refId: input.refId,
      channel: input.channel ?? "offchain",
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { grossAmount, feeAmount, netAmount, feeBps };
}

/** Community fees (zakat/charity), rate from platform_config/community_program */
export async function applyCommunityProtocolFee(input: {
  uid: string;
  kind: "zakat" | "charity";
  grossAmount: number;
  refId: string;
}): Promise<ApplyFeeResult> {
  const community = await getCommunityProgramConfig();
  const feeBps =
    input.kind === "zakat"
      ? community.zakat.protocolFeeBps
      : community.charity.protocolFeeBps;

  if (feeBps <= 0) {
    return { grossAmount: input.grossAmount, feeAmount: 0, netAmount: input.grossAmount, feeBps: 0 };
  }

  const config = await getFeeConfig();
  const feeAmount = computeFeeAmount(input.grossAmount, feeBps);
  const netAmount = input.grossAmount - feeAmount;

  const db = adminDb();
  const dist = config.distributionBps;

  await db.runTransaction(async (tx) => {
    const treasuryRef = db.doc(TREASURY_LEDGER);
    const treasurySnap = await tx.get(treasuryRef);
    const buckets = (treasurySnap.data()?.buckets ?? {}) as Record<string, number>;

    const bucketKeys = ["main", "validator", "referral", "burn", "liquidity", "insurance", "autoDistribution"] as const;
    const distValues = [
      dist.main, dist.validator, dist.referral, dist.burn,
      dist.liquidity, dist.insurance, dist.autoDistribution,
    ];

    let remaining = feeAmount;
    for (let i = 0; i < bucketKeys.length - 1; i++) {
      const share = (feeAmount * distValues[i]) / 10_000;
      if (share > 0) {
        buckets[bucketKeys[i]] = (buckets[bucketKeys[i]] ?? 0) + share;
        remaining -= share;
      }
    }
    buckets.autoDistribution = (buckets.autoDistribution ?? 0) + remaining;

    tx.set(treasuryRef, {
      buckets,
      totalCollected: FieldValue.increment(feeAmount),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    tx.set(db.collection(FEE_LEDGER).doc(), {
      uid: input.uid,
      feeType: input.kind,
      grossAmount: input.grossAmount,
      feeAmount,
      netAmount,
      feeBps,
      refId: input.refId,
      channel: "community",
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { grossAmount: input.grossAmount, feeAmount, netAmount, feeBps };
}

export async function deductLedger(uid: string, amount: number, feature?: import("./payHubOnChainWrite.js").PayHubOnChainWriteFeature) {
  if (amount <= 0) return;
  if (!shouldMutateFirestorePayLedger(feature)) return;
  const db = adminDb();
  const ref = db.collection("pay_ledgers").doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const balance = snap.exists ? Number(snap.data()?.gatBalance ?? 0) : 0;
    if (balance < amount) throw new Error("Insufficient GAT balance");
    tx.set(ref, {
      uid,
      gatBalance: balance - amount,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

export async function creditLedger(uid: string, amount: number, feature?: import("./payHubOnChainWrite.js").PayHubOnChainWriteFeature) {
  if (amount <= 0) return;
  if (!shouldMutateFirestorePayLedger(feature)) return;
  const db = adminDb();
  const ref = db.collection("pay_ledgers").doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const balance = snap.exists ? Number(snap.data()?.gatBalance ?? 0) : 0;
    tx.set(ref, {
      uid,
      gatBalance: balance + amount,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

export type ProtocolSettleAction =
  | "market_checkout"
  | "invest_deposit"
  | "invest_redeem"
  | "stake"
  | "unstake"
  | "sda_lock"
  | "sda_unlock"
  | "zakat_pay"
  | "charity_donate";

export type ProtocolSettleExtra = {
  amountSda?: number;
  productId?: string;
  fundId?: number;
  merchantSplits?: MarketMerchantSplit[];
  txHash?: string;
  walletAddress?: string;
};

const ACTION_FEE_TYPE: Record<
  Exclude<ProtocolSettleAction, "zakat_pay" | "charity_donate" | "sda_lock" | "sda_unlock">,
  FeeType
> = {
  market_checkout: "market",
  invest_deposit: "investment",
  invest_redeem: "withdraw",
  stake: "staking",
  unstake: "withdraw",
};

const SETTLEMENTS_COL = "protocol_settlements";

async function recordProtocolSettlement(input: {
  refId: string;
  uid: string;
  action: ProtocolSettleAction;
  grossAmountGat: number;
  fundId?: number;
  source?: string;
  txHash?: string;
  walletAddress?: string;
}) {
  const db = adminDb();
  const ref = db.collection(SETTLEMENTS_COL).doc(input.refId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) throw new Error("Duplicate refId");
    tx.set(ref, {
      uid: input.uid,
      action: input.action,
      grossAmountGat: input.grossAmountGat,
      fundId: input.fundId ?? null,
      source: input.source ?? "offchain",
      txHash: input.txHash ?? null,
      walletAddress: input.walletAddress ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

/** Checkout market, GAT sudah ditransfer on-chain ke treasury (selaras saldo dompet). */
async function settleMarketCheckoutFromWallet(
  uid: string,
  grossAmountGat: number,
  refId: string,
  extra: ProtocolSettleExtra,
) {
  const txHash = String(extra.txHash ?? "").trim();
  const walletAddress = String(extra.walletAddress ?? "").trim();
  if (!txHash || !walletAddress) {
    throw new Error("Market checkout requires on-chain txHash and wallet");
  }

  const verified = await verifyGatDepositTransfer(txHash, walletAddress);
  if (Math.abs(verified.amountGat - grossAmountGat) > 0.05) {
    throw new Error("Checkout amount mismatch");
  }

  const db = adminDb();
  const existing = await db.collection(SETTLEMENTS_COL).doc(refId).get();
  if (existing.exists) {
    const data = existing.data()!;
    if (data.uid === uid && data.action === "market_checkout") {
      return {
        grossAmount: Number(data.grossAmountGat ?? grossAmountGat),
        feeAmount: Number(data.feeAmount ?? 0),
        netAmount: Number(data.netAmount ?? grossAmountGat),
        feeBps: Number(data.feeBps ?? 0),
        action: "market_checkout" as const,
        refId,
      };
    }
    throw new Error("Duplicate refId");
  }

  const dupTx = await db
    .collection(SETTLEMENTS_COL)
    .where("txHash", "==", txHash.toLowerCase())
    .limit(1)
    .get();
  if (!dupTx.empty) throw new Error("Checkout transaction already registered");

  const feeResult = await applyProtocolFee({
    uid,
    feeType: "market",
    grossAmount: grossAmountGat,
    refId,
    channel: "onchain_wallet",
  });

  await recordProtocolSettlement({
    refId,
    uid,
    action: "market_checkout",
    grossAmountGat,
    source: "onchain",
    txHash: txHash.toLowerCase(),
    walletAddress: walletAddress.toLowerCase(),
  });

  if (extra.merchantSplits?.length) {
    await creditMarketMerchantSplits(
      uid,
      refId,
      extra.merchantSplits,
      feeResult.grossAmount,
      feeResult.netAmount,
    );
  }

  return { ...feeResult, action: "market_checkout" as const, refId };
}

export async function assertInvestmentDepositSettlement(
  uid: string,
  refId: string,
  fundId: number,
  amountUsd: number,
) {
  const snap = await adminDb().collection(SETTLEMENTS_COL).doc(refId).get();
  if (!snap.exists) throw new Error("Settlement not found");
  const data = snap.data()!;
  if (data.uid !== uid) throw new Error("Settlement mismatch");
  if (data.action !== "invest_deposit") throw new Error("Invalid settlement action");
  if (Number(data.fundId) !== fundId) throw new Error("Fund mismatch");
  if (Math.abs(Number(data.grossAmountGat) - amountUsd) > 0.0001) {
    throw new Error("Amount mismatch");
  }
}

export async function settleProtocolAction(
  uid: string,
  action: ProtocolSettleAction,
  grossAmountGat: number,
  refId: string,
  extra?: ProtocolSettleExtra,
) {
  if (action === "sda_lock") {
    const txHash = String(extra?.txHash ?? "").trim();
    const walletAddress = String(extra?.walletAddress ?? "").trim();
    const productId = String(extra?.productId ?? "").trim();
    if (!productId || !txHash || !walletAddress) {
      throw new Error("Invalid SDA lock request, on-chain txHash and wallet required");
    }
    return lockSdaStakeOnChain(uid, productId, txHash, walletAddress, refId);
  }

  if (action === "sda_unlock") {
    const walletAddress = String(extra?.walletAddress ?? "").trim();
    if (!walletAddress) {
      throw new Error("Wallet address required to receive unlocked SDA on-chain");
    }
    return unlockSdaStake(uid, refId, walletAddress);
  }

  if (action === "market_checkout" && extra?.txHash && extra?.walletAddress) {
    return settleMarketCheckoutFromWallet(uid, grossAmountGat, refId, extra);
  }

  if (!Number.isFinite(grossAmountGat) || grossAmountGat <= 0) {
    throw new Error("Invalid amount");
  }

  if (action === "invest_deposit" || action === "stake") {
    throw new Error(
      "Ledger invest/stake is deprecated, use on-chain vault/pool from your wallet",
    );
  }

  if (action === "invest_redeem" || action === "unstake") {
    throw new Error(
      "Use POST /protocol/legacy-redeem-invest or /protocol/legacy-unstake-gat for legacy positions",
    );
  }

  if (action === "zakat_pay" || action === "charity_donate") {
    const kind = action === "zakat_pay" ? "zakat" : "charity";
    const feeResult = await settleCommunityContribution(uid, kind, grossAmountGat, refId);
    return { ...feeResult, action, refId };
  }

  const feeType = ACTION_FEE_TYPE[action];
  const feeResult = await applyProtocolFee({
    uid,
    feeType,
    grossAmount: grossAmountGat,
    refId,
    channel: "offchain",
  });

  await recordProtocolSettlement({
    refId,
    uid,
    action,
    grossAmountGat,
    fundId: extra?.fundId,
  });

  if (isOnChainWritePrimaryFor("protocol")) {
    await assertOnChainPayHubSpendable(uid, feeResult.grossAmount);
    if (feeResult.feeAmount > 0) {
      await relayProtocolFeeOnChain({
        payerUid: uid,
        feeAmountGat: feeResult.feeAmount,
        refId,
      });
    }
  }

  await deductLedger(uid, grossAmountGat, "protocol");

  if (action === "market_checkout" && extra?.merchantSplits?.length) {
    await creditMarketMerchantSplits(
      uid,
      refId,
      extra.merchantSplits,
      feeResult.grossAmount,
      feeResult.netAmount,
    );
  }

  return { ...feeResult, action, refId };
}

export async function getProtocolTreasurySummary() {
  const db = adminDb();
  const [treasurySnap, feeSnap, goldSnap, insuranceSnap] = await Promise.all([
    db.doc(TREASURY_LEDGER).get(),
    db.collection(FEE_LEDGER).orderBy("createdAt", "desc").limit(20).get().catch(() => null),
    db.collection(GOLD_RESERVE).orderBy("recordedAt", "desc").limit(1).get().catch(() => null),
    db.doc(INSURANCE_FUND).get(),
  ]);

  const treasury = treasurySnap.data() ?? { buckets: {}, totalCollected: 0 };
  const recentFees = feeSnap?.docs.map((d) => ({ id: d.id, ...d.data() })) ?? [];
  const goldReserve = goldSnap?.docs[0]?.data() ?? null;
  const insurance = insuranceSnap.data() ?? { balanceGat: 0 };

  return {
    treasury,
    recentFees,
    goldReserve,
    insurance,
    contracts: {
      treasury: process.env.VITE_GAT_TREASURY_ADDRESS ?? null,
      feeRouter: process.env.VITE_GAT_FEE_ROUTER_ADDRESS ?? null,
      stakingPool: process.env.VITE_GAT_STAKING_POOL_ADDRESS ?? null,
      investmentVault: process.env.VITE_GAT_INVESTMENT_VAULT_ADDRESS ?? null,
      gatToken: process.env.VITE_GAT_TOKEN_ADDRESS ?? null,
    },
  };
}

export async function recordReferralEvent(input: {
  referrerUid: string;
  referredUid: string;
  code: string;
  rewardGat?: number;
}) {
  const db = adminDb();
  await db.collection(REFERRAL_COL).add({
    ...input,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function recordGoldReserve(input: {
  grams: number;
  attestationUri: string;
  recordedBy: string;
}) {
  const db = adminDb();
  await db.collection(GOLD_RESERVE).add({
    ...input,
    recordedAt: FieldValue.serverTimestamp(),
  });
}

export async function recordProtocolAudit(input: {
  contract: string;
  auditor: string;
  reportUri: string;
  status: "pending" | "passed" | "failed";
}) {
  const db = adminDb();
  await db.collection(AUDIT_COL).add({
    ...input,
    auditedAt: FieldValue.serverTimestamp(),
  });
}

export async function deductReferralTreasury(amount: number) {
  if (amount <= 0) return;
  const db = adminDb();
  const treasuryRef = db.doc(TREASURY_LEDGER);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(treasuryRef);
    const buckets = (snap.data()?.buckets ?? {}) as Record<string, number>;
    const current = Number(buckets.referral ?? 0);
    if (current >= amount) {
      buckets.referral = current - amount;
      tx.set(treasuryRef, { buckets, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  });
}

export async function creditReferralReward(uid: string, amount: number) {
  return creditLedger(uid, amount, "protocol");
}

export async function creditValidatorReward(uid: string, amount: number) {
  return creditLedger(uid, amount);
}

/** Deduct from validator treasury bucket when paying validator rewards. Falls back silently if bucket empty. */
export async function deductValidatorTreasury(amount: number) {
  if (amount <= 0) return;
  const db = adminDb();
  const treasuryRef = db.doc(TREASURY_LEDGER);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(treasuryRef);
    const buckets = (snap.data()?.buckets ?? {}) as Record<string, number>;
    const current = Number(buckets.validator ?? 0);
    if (current >= amount) {
      buckets.validator = current - amount;
      tx.set(treasuryRef, { buckets, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  });
}
