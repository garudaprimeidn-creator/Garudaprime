import { FieldValue } from "firebase-admin/firestore";
import {
  computeFeeAmount,
  DEFAULT_DISTRIBUTION_BPS,
  type DistributionBps,
} from "../src/lib/protocol/feeTypes.js";
import { getCommunityProgramConfig } from "./platformProgramsCore.js";
import { adminDb } from "./firebaseAdmin.js";
import { shouldMutateFirestorePayLedger } from "./payHubOnChainWrite.js";
import { assertOnChainPayHubSpendable } from "./payHubOnChainBalance.js";
import { relayProtocolFeeOnChain } from "./onChainPayHubAdapter.js";

const FEE_CONFIG_DOC = "platform_config/fees";

export const ZAKAT_FUND_DOC = "community_funds/zakat";
export const CHARITY_FUND_DOC = "community_funds/charity";
export const COMMUNITY_FUND_LEDGER = "community_fund_ledger";
const FEE_LEDGER = "fee_ledger";
const TREASURY_LEDGER = "protocol_treasury/ledger";
const PAY_LEDGER = "pay_ledgers";

export type CommunityFundKind = "zakat" | "charity";

function fundDoc(kind: CommunityFundKind) {
  return kind === "zakat" ? ZAKAT_FUND_DOC : CHARITY_FUND_DOC;
}

export type CommunityFundSnapshot = {
  balanceGat: number;
  totalReceived: number;
  totalDisbursed: number;
  updatedAt?: unknown;
};

export type CommunityFundLedgerEntry = {
  id: string;
  type: "contribution" | "disbursement";
  fund: CommunityFundKind;
  grossAmount?: number;
  feeAmount?: number;
  netAmount?: number;
  amountGat?: number;
  uid?: string;
  refId?: string;
  recipientName?: string;
  recipientAddress?: string | null;
  note?: string | null;
  txHash?: string | null;
  disbursedBy?: string;
  createdAt?: unknown;
};

export async function settleCommunityContribution(
  uid: string,
  fund: CommunityFundKind,
  grossAmountGat: number,
  refId: string,
) {
  if (!Number.isFinite(grossAmountGat) || grossAmountGat <= 0) {
    throw new Error("Invalid amount");
  }

  const community = await getCommunityProgramConfig();
  if (fund === "zakat" && !community.zakat.enabled) {
    throw new Error("Zakat payments are disabled");
  }
  if (fund === "charity" && !community.charity.enabled) {
    throw new Error("Charity donations are disabled");
  }

  const feeBps =
    fund === "zakat" ? community.zakat.protocolFeeBps : community.charity.protocolFeeBps;
  const feeAmount = computeFeeAmount(grossAmountGat, feeBps);
  const netAmount = grossAmountGat - feeAmount;

  const feeConfigSnap = await adminDb().doc(FEE_CONFIG_DOC).get();
  const feeConfigData = feeConfigSnap.data() as { distributionBps?: Partial<DistributionBps> } | undefined;
  const dist = { ...DEFAULT_DISTRIBUTION_BPS, ...feeConfigData?.distributionBps };
  const db = adminDb();
  const mutateUserLedger = shouldMutateFirestorePayLedger("protocol");

  if (!mutateUserLedger) {
    await assertOnChainPayHubSpendable(uid, grossAmountGat);
    if (feeAmount > 0) {
      await relayProtocolFeeOnChain({
        payerUid: uid,
        feeAmountGat: feeAmount,
        refId,
      });
    }
  }

  await db.runTransaction(async (tx) => {
    if (mutateUserLedger) {
      const userRef = db.collection(PAY_LEDGER).doc(uid);
      const userSnap = await tx.get(userRef);
      const userBalance = userSnap.exists ? Number(userSnap.data()?.gatBalance ?? 0) : 0;
      if (userBalance < grossAmountGat) throw new Error("Insufficient GAT balance");

      tx.set(
        userRef,
        {
          uid,
          gatBalance: userBalance - grossAmountGat,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    const fundRef = db.doc(fundDoc(fund));
    const fundSnap = await tx.get(fundRef);
    const fundBalance = fundSnap.exists ? Number(fundSnap.data()?.balanceGat ?? 0) : 0;
    tx.set(
      fundRef,
      {
        balanceGat: fundBalance + netAmount,
        totalReceived: FieldValue.increment(netAmount),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (feeAmount > 0) {
      const treasuryRef = db.doc(TREASURY_LEDGER);
      const treasurySnap = await tx.get(treasuryRef);
      const buckets = (treasurySnap.data()?.buckets ?? {}) as Record<string, number>;

      const bucketKeys = [
        "main",
        "validator",
        "referral",
        "burn",
        "liquidity",
        "insurance",
        "autoDistribution",
      ] as const;
      const distValues = [
        dist.main,
        dist.validator,
        dist.referral,
        dist.burn,
        dist.liquidity,
        dist.insurance,
        dist.autoDistribution,
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

      tx.set(
        treasuryRef,
        {
          buckets,
          totalCollected: FieldValue.increment(feeAmount),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      tx.set(db.collection(FEE_LEDGER).doc(), {
        uid,
        feeType: fund,
        grossAmount: grossAmountGat,
        feeAmount,
        netAmount,
        feeBps,
        refId,
        channel: "community",
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    tx.set(db.collection(COMMUNITY_FUND_LEDGER).doc(), {
      type: "contribution",
      fund,
      uid,
      grossAmount: grossAmountGat,
      feeAmount,
      netAmount,
      refId,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return {
    grossAmount: grossAmountGat,
    feeAmount,
    netAmount,
    feeBps,
    fund,
    refId,
  };
}

export async function disburseCommunityFund(input: {
  fund: CommunityFundKind;
  amountGat: number;
  recipientName: string;
  recipientAddress?: string;
  note?: string;
  txHash?: string;
  disbursedBy: string;
}) {
  const amount = input.amountGat;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid disbursement amount");
  }
  if (!input.recipientName.trim()) {
    throw new Error("Recipient name required");
  }

  const db = adminDb();
  await db.runTransaction(async (tx) => {
    const fundRef = db.doc(fundDoc(input.fund));
    const fundSnap = await tx.get(fundRef);
    const balance = fundSnap.exists ? Number(fundSnap.data()?.balanceGat ?? 0) : 0;
    if (balance < amount) throw new Error("Insufficient fund balance");

    tx.set(
      fundRef,
      {
        balanceGat: balance - amount,
        totalDisbursed: FieldValue.increment(amount),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    tx.set(db.collection(COMMUNITY_FUND_LEDGER).doc(), {
      type: "disbursement",
      fund: input.fund,
      amountGat: amount,
      recipientName: input.recipientName.trim(),
      recipientAddress: input.recipientAddress?.trim() || null,
      note: input.note?.trim() || null,
      txHash: input.txHash?.trim() || null,
      disbursedBy: input.disbursedBy,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

function mapFundDoc(data: FirebaseFirestore.DocumentData | undefined): CommunityFundSnapshot {
  return {
    balanceGat: Number(data?.balanceGat ?? 0),
    totalReceived: Number(data?.totalReceived ?? 0),
    totalDisbursed: Number(data?.totalDisbursed ?? 0),
    updatedAt: data?.updatedAt,
  };
}

export async function getCommunityFundsSummary(limit = 30) {
  const db = adminDb();
  const [zakatSnap, charitySnap, ledgerSnap] = await Promise.all([
    db.doc(ZAKAT_FUND_DOC).get(),
    db.doc(CHARITY_FUND_DOC).get(),
    db
      .collection(COMMUNITY_FUND_LEDGER)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get()
      .catch(() => null),
  ]);

  const ledger: CommunityFundLedgerEntry[] =
    ledgerSnap?.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CommunityFundLedgerEntry, "id">) })) ??
    [];

  return {
    zakat: mapFundDoc(zakatSnap.data()),
    charity: mapFundDoc(charitySnap.data()),
    ledger,
  };
}

/** Public-facing summary, omits contributor UIDs */
export async function getCommunityFundsPublicSummary() {
  const summary = await getCommunityFundsSummary(20);
  return {
    zakat: summary.zakat,
    charity: summary.charity,
    recentDisbursements: summary.ledger
      .filter((e) => e.type === "disbursement")
      .slice(0, 10)
      .map((e) => ({
        id: e.id,
        fund: e.fund,
        amountGat: e.amountGat ?? 0,
        recipientName: e.recipientName ?? "",
        recipientAddress: e.recipientAddress ?? null,
        note: e.note ?? null,
        txHash: e.txHash ?? null,
        createdAt: e.createdAt,
      })),
    recentContributions: summary.ledger
      .filter((e) => e.type === "contribution")
      .slice(0, 5)
      .map((e) => ({
        id: e.id,
        fund: e.fund,
        netAmount: e.netAmount ?? 0,
        createdAt: e.createdAt,
      })),
  };
}
