import { FieldValue } from "firebase-admin/firestore";
import {
  calcStakingReward,
  calcStakingRewardGatFromSda,
} from "../src/lib/invest/investPortfolio.js";
import { computeFeeAmount, DEFAULT_FEE_RATES_BPS } from "../src/lib/protocol/feeTypes.js";
import { adminDb } from "./firebaseAdmin.js";
import { getStakingProductsConfig, getTokenPricesConfig } from "./platformProgramsCore.js";
import { verifyNativeSdaToTreasury } from "./paySwapCore.js";
import { isPayHubWithdrawConfigured, sendNativeSdaOnSidra } from "./payLedgerCore.js";

export const SDA_STAKES_COL = "sda_stakes";
export const SDA_POOL_DOC = "sda_staking_pool/summary";
const PAY_LEDGER = "pay_ledgers";
const TREASURY_LEDGER = "protocol_treasury/ledger";
const REWARD_BUCKET = "autoDistribution";

export async function lockSdaStake(_uid: string, _productId: string, _amountSda: number, _refId: string) {
  throw new Error("SDA Pay Hub balance is disabled, lock SDA on-chain from your wallet");
}

export async function lockSdaStakeOnChain(
  uid: string,
  productId: string,
  txHash: string,
  walletAddress: string,
  refId: string,
) {
  const normalizedWallet = walletAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalizedWallet)) {
    throw new Error("Invalid wallet address");
  }

  const inbound = await verifyNativeSdaToTreasury(txHash, normalizedWallet);
  const amountSda = inbound.amountSda;

  const { products } = await getStakingProductsConfig();
  const product = products.find((p) => p.id === productId && p.token === "SDA");
  if (!product) throw new Error("Invalid SDA staking product");
  if (amountSda < product.minAmount) {
    throw new Error(`Minimum lock is ${product.minAmount} SDA`);
  }

  const db = adminDb();
  const stakeRef = db.collection(SDA_STAKES_COL).doc(refId);
  const existing = await stakeRef.get();
  if (existing.exists && existing.data()?.status === "locked") {
    throw new Error("Stake reference already used");
  }

  const dupTx = await db
    .collection(SDA_STAKES_COL)
    .where("lockTxHash", "==", txHash.trim().toLowerCase())
    .limit(1)
    .get();
  if (!dupTx.empty) throw new Error("Lock transaction already registered");

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(stakeRef);
    if (fresh.exists && fresh.data()?.status === "locked") {
      throw new Error("Stake reference already used");
    }

    tx.set(stakeRef, {
      uid,
      productId,
      stakedSda: amountSda,
      apr: product.apr,
      lockDays: product.lockDays,
      startedAt: FieldValue.serverTimestamp(),
      status: "locked",
      refId,
      lockTxHash: txHash.trim().toLowerCase(),
      walletAddress: normalizedWallet,
      source: "onchain",
    });

    const poolRef = db.doc(SDA_POOL_DOC);
    tx.set(
      poolRef,
      {
        totalLockedSda: FieldValue.increment(amountSda),
        activeLocks: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  return { action: "sda_lock" as const, refId, stakedSda: amountSda, productId, lockTxHash: txHash };
}

export async function unlockSdaStake(uid: string, refId: string, walletAddress: string) {
  const normalizedWallet = walletAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalizedWallet)) {
    throw new Error("Invalid wallet address");
  }
  if (!isPayHubWithdrawConfigured()) {
    throw new Error("On-chain SDA unlock is not configured on server");
  }

  const db = adminDb();
  const stakeRef = db.collection(SDA_STAKES_COL).doc(refId);
  const stakeSnap = await stakeRef.get();
  if (!stakeSnap.exists) throw new Error("SDA lock not found");

  const stake = stakeSnap.data()!;
  if (stake.uid !== uid) throw new Error("Unauthorized");
  if (stake.status !== "locked") throw new Error("SDA lock already released");

  const stakedSda = Number(stake.stakedSda ?? 0);
  const apr = Number(stake.apr ?? 0);
  const lockDays = Number(stake.lockDays ?? 0);
  const startedAtRaw = stake.startedAt;
  const startedAt =
    startedAtRaw && typeof startedAtRaw === "object" && "toDate" in startedAtRaw
      ? (startedAtRaw as { toDate: () => Date }).toDate().toISOString()
      : typeof startedAtRaw === "string"
        ? startedAtRaw
        : new Date().toISOString();

  if (lockDays > 0) {
    const unlockAt = new Date(startedAt).getTime() + lockDays * 86400000;
    if (Date.now() < unlockAt) throw new Error("SDA lock period not finished");
  }

  const prices = (await getTokenPricesConfig()).prices;
  const rewardGat = calcStakingRewardGatFromSda(
    stakedSda,
    apr,
    startedAt,
    prices.SDA ?? 0,
    prices.GAT ?? 0,
  );
  const feeBps = DEFAULT_FEE_RATES_BPS.withdraw;
  const feeGat = computeFeeAmount(rewardGat, feeBps);
  const netRewardGat = Math.max(0, rewardGat - feeGat);

  await db.runTransaction(async (tx) => {
    const freshStake = await tx.get(stakeRef);
    if (!freshStake.exists || freshStake.data()?.status !== "locked") {
      throw new Error("SDA lock already released");
    }

    const userRef = db.collection(PAY_LEDGER).doc(uid);
    const userSnap = await tx.get(userRef);
    const gatBalance = userSnap.exists ? Number(userSnap.data()?.gatBalance ?? 0) : 0;

    tx.set(
      userRef,
      {
        uid,
        gatBalance: gatBalance + netRewardGat,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (netRewardGat > 0 || feeGat > 0) {
      const treasuryRef = db.doc(TREASURY_LEDGER);
      const treasurySnap = await tx.get(treasuryRef);
      const buckets = (treasurySnap.data()?.buckets ?? {}) as Record<string, number>;
      const bucketBal = Number(buckets[REWARD_BUCKET] ?? 0);
      const totalFromBucket = netRewardGat + feeGat;
      if (bucketBal < totalFromBucket) {
        throw new Error("Insufficient GAT in autoDistribution bucket for SDA rewards");
      }
      buckets[REWARD_BUCKET] = bucketBal - totalFromBucket;
      tx.set(
        treasuryRef,
        { buckets, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }

    tx.set(stakeRef, {
      status: "released",
      releasedAt: FieldValue.serverTimestamp(),
      rewardGat,
      feeGat,
      netRewardGat,
      unlockWalletAddress: normalizedWallet,
    }, { merge: true });

    const poolRef = db.doc(SDA_POOL_DOC);
    tx.set(
      poolRef,
      {
        totalLockedSda: FieldValue.increment(-stakedSda),
        totalRewardsPaidGat: FieldValue.increment(netRewardGat),
        activeLocks: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  let unlockTxHash: string | undefined;
  try {
    unlockTxHash = await sendNativeSdaOnSidra(normalizedWallet, stakedSda);
    await stakeRef.set({ unlockTxHash }, { merge: true });
  } catch (err) {
    await db.runTransaction(async (tx) => {
      const freshStake = await tx.get(stakeRef);
      if (!freshStake.exists || freshStake.data()?.status !== "released") return;

      const userRef = db.collection(PAY_LEDGER).doc(uid);
      const userSnap = await tx.get(userRef);
      const gatBalance = userSnap.exists ? Number(userSnap.data()?.gatBalance ?? 0) : 0;

      tx.set(
        userRef,
        {
          uid,
          gatBalance: Math.max(0, gatBalance - netRewardGat),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      if (netRewardGat > 0 || feeGat > 0) {
        const treasuryRef = db.doc(TREASURY_LEDGER);
        const treasurySnap = await tx.get(treasuryRef);
        const buckets = (treasurySnap.data()?.buckets ?? {}) as Record<string, number>;
        buckets[REWARD_BUCKET] = Number(buckets[REWARD_BUCKET] ?? 0) + netRewardGat + feeGat;
        tx.set(
          treasuryRef,
          { buckets, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }

      tx.set(stakeRef, {
        status: "locked",
        releasedAt: FieldValue.delete(),
        rewardGat: FieldValue.delete(),
        feeGat: FieldValue.delete(),
        netRewardGat: FieldValue.delete(),
        unlockWalletAddress: FieldValue.delete(),
      }, { merge: true });

      const poolRef = db.doc(SDA_POOL_DOC);
      tx.set(
        poolRef,
        {
          totalLockedSda: FieldValue.increment(stakedSda),
          totalRewardsPaidGat: FieldValue.increment(-netRewardGat),
          activeLocks: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
    throw err instanceof Error ? err : new Error(String(err));
  }

  const rewardSda = calcStakingReward(stakedSda, apr, startedAt);

  return {
    action: "sda_unlock" as const,
    refId,
    stakedSda,
    rewardSda,
    rewardGat,
    feeGat,
    netRewardGat,
    grossAmount: rewardGat,
    feeAmount: feeGat,
    netAmount: netRewardGat,
    feeBps,
    unlockTxHash,
  };
}

export async function getSdaStakingSummary() {
  const db = adminDb();
  const [poolSnap, treasurySnap, recentSnap] = await Promise.all([
    db.doc(SDA_POOL_DOC).get(),
    db.doc(TREASURY_LEDGER).get(),
    db
      .collection(SDA_STAKES_COL)
      .orderBy("startedAt", "desc")
      .limit(20)
      .get()
      .catch(() => null),
  ]);

  const pool = poolSnap.data() ?? {};
  const buckets = (treasurySnap.data()?.buckets ?? {}) as Record<string, number>;

  return {
    pool: {
      totalLockedSda: Number(pool.totalLockedSda ?? 0),
      totalRewardsPaidGat: Number(pool.totalRewardsPaidGat ?? 0),
      activeLocks: Number(pool.activeLocks ?? 0),
    },
    rewardBucket: {
      name: REWARD_BUCKET,
      balanceGat: Number(buckets[REWARD_BUCKET] ?? 0),
    },
    recentLocks:
      recentSnap?.docs.map((d) => ({ id: d.id, ...d.data() })) ?? [],
  };
}
