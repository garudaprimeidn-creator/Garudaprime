import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import { resolvePrimaryWalletForUid } from "./chainBalanceService.js";
import { resolveUidFromWalletAddress } from "./walletIdentityCore.js";
import { syncPersonalMerchantVaultForUid } from "./payHubMerchantOnChain.js";
import { relayMarketCheckoutOnChain } from "./onChainPayHubAdapter.js";
import { isOnChainWritePrimaryFor, shouldMutateFirestorePayLedger } from "./payHubOnChainWrite.js";

export type MerchantDoc = {
  name: string;
  verified?: boolean;
  walletAddress?: string | null;
  ownerUid?: string | null;
  gatBalance?: number;
  businessScale?: "umi" | "regular" | null;
  /** Short shop code for invoices (e.g. HTM, AJW). */
  shopSymbol?: string | null;
  /** Branch / city code (e.g. JKT, BDG). */
  shopLocation?: string | null;
  /** Derived prefix: SYMBOL-LOCATION */
  invoicePrefix?: string | null;
};

export type MarketMerchantSplit = {
  merchantId: string;
  grossGat: number;
  orderId?: string;
};

const DEFAULT_MERCHANT_ID = process.env.VITE_PAY_HUB_MERCHANT_ID?.trim() || "GP-MRT-2847";

const isEthAddress = (raw: string | null | undefined): string | null => {
  const value = raw?.trim();
  return value && /^0x[a-fA-F0-9]{40}$/i.test(value) ? value : null;
};

/** Platform default merchant vault from env (backing EOA / treasury). */
export const defaultMerchantVaultFromEnv = (): string | null =>
  isEthAddress(process.env.PAY_HUB_DEFAULT_MERCHANT_VAULT)
  || isEthAddress(process.env.VITE_PAY_HUB_MERCHANT_ADDRESS)
  || isEthAddress(process.env.VITE_PAY_HUB_BACKING_ADDRESS)
  || isEthAddress(process.env.PAY_HUB_RELAYER_ADDRESS);

/** Owner explicitly linked in Firestore, used when crediting Pay Hub ledger. */
export const resolveLinkedOwnerUid = (merchant: MerchantDoc): string | null =>
  merchant.ownerUid?.trim() || null;

/** Includes env fallback for legacy default merchant pool display. */
export const resolveMerchantOwnerUid = (merchant: MerchantDoc): string | null =>
  resolveLinkedOwnerUid(merchant)
  || process.env.PAY_HUB_MERCHANT_OWNER_UID?.trim()
  || null;

const resolveOwnerUid = resolveMerchantOwnerUid;

const merchantIdIsDefault = (merchantId: string): boolean =>
  merchantId === DEFAULT_MERCHANT_ID;

/** Resolve on-chain vault for merchant pay relay (owner wallet → merchant doc → env). */
export const resolveMerchantVaultAddress = async (
  merchant: MerchantDoc,
  merchantId: string,
): Promise<string | null> => {
  const ownerUid = resolveOwnerUid(merchant);
  if (ownerUid) {
    const ownerVault = await resolvePrimaryWalletForUid(ownerUid);
    if (ownerVault) return ownerVault;
  }

  const merchantWallet = isEthAddress(merchant.walletAddress);
  if (merchantWallet) return merchantWallet;

  if (merchantIdIsDefault(merchantId)) {
    return defaultMerchantVaultFromEnv();
  }

  return null;
};

export const personalMerchantIdForUid = (uid: string): string =>
  `GP-USR-${uid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toUpperCase()}`;

/** Prefer vault owner personal merchant when QR carries stale platform default ID. */
export const resolveMerchantIdForSettlement = async (
  merchantId: string,
  recipientVault?: string,
): Promise<string> => {
  const normalized = merchantId.trim().toUpperCase();
  if (normalized.startsWith("GP-USR-")) return normalized;

  const vault = recipientVault?.trim();
  if (vault && /^0x[a-fA-F0-9]{40}$/i.test(vault)) {
    const ownerUid = await resolveUidFromWalletAddress(vault);
    if (ownerUid) {
      const personalId = personalMerchantIdForUid(ownerUid);
      if (!normalized || merchantIdIsDefault(normalized) || normalized === personalId) {
        return personalId;
      }
      const merchantSnap = await adminDb().collection("pay_merchants").doc(normalized).get();
      const linkedUid = merchantSnap.exists
        ? (merchantSnap.data()?.ownerUid as string | undefined)?.trim()
        : undefined;
      if (linkedUid === ownerUid) return normalized;
      return personalId;
    }
  }
  return normalized || DEFAULT_MERCHANT_ID;
};

/** Ensure each user has a personal merchant linked to their Pay Hub ledger. */
export const ensurePersonalMerchant = async (uid: string, displayName?: string) => {
  const db = adminDb();
  const merchantId = personalMerchantIdForUid(uid);
  const ref = db.collection("pay_merchants").doc(merchantId);
  const snap = await ref.get();

  if (snap.exists) {
    const data = snap.data() as MerchantDoc;
    const linked = data.ownerUid?.trim();
    if (linked && linked !== uid) throw new Error("Merchant already linked to another account");
    const ownerVault = await resolvePrimaryWalletForUid(uid);
    const patches: Partial<MerchantDoc> = {};
    if (!linked) patches.ownerUid = uid;
    if (ownerVault && ownerVault.toLowerCase() !== (data.walletAddress ?? "").toLowerCase()) {
      patches.walletAddress = ownerVault;
    }
    if (Object.keys(patches).length) {
      await ref.set({
        ...patches,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await syncPersonalMerchantVaultForUid(uid, merchantId);
    return {
      merchantId,
      name: data.name ?? displayName ?? "Garuda Merchant",
      ownerUid: uid,
      walletAddress: ownerVault ?? data.walletAddress ?? null,
    };
  }

  const seed: MerchantDoc = {
    name: displayName?.trim() || "Garuda Merchant",
    verified: true,
    walletAddress: null,
    ownerUid: uid,
    gatBalance: 0,
  };
  await ref.set({ ...seed, createdAt: FieldValue.serverTimestamp() });
  await syncPersonalMerchantVaultForUid(uid, merchantId);
  return { merchantId, ...seed };
};

/** Update personal merchant branding, name, shop symbol, location, invoice prefix. */
export const updatePersonalMerchantProfile = async (
  uid: string,
  patch: { name?: string; shopSymbol?: string; shopLocation?: string },
) => {
  await ensurePersonalMerchant(uid);
  const merchantId = personalMerchantIdForUid(uid);
  const ref = adminDb().collection("pay_merchants").doc(merchantId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Merchant not found");

  const data = snap.data() as MerchantDoc;
  const linked = data.ownerUid?.trim();
  if (linked && linked !== uid) throw new Error("Merchant already linked to another account");

  const updates: Partial<MerchantDoc> = {};
  const name = patch.name?.trim();
  if (name) updates.name = name.slice(0, 80);

  if (patch.shopSymbol !== undefined) {
    const sym = patch.shopSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    updates.shopSymbol = sym || null;
  }
  if (patch.shopLocation !== undefined) {
    const loc = patch.shopLocation.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    updates.shopLocation = loc || null;
  }

  const sym = updates.shopSymbol ?? data.shopSymbol ?? null;
  const loc = updates.shopLocation ?? data.shopLocation ?? null;
  if (sym && loc) updates.invoicePrefix = `${sym}-${loc}`;
  else if (sym) updates.invoicePrefix = sym;
  else if (loc) updates.invoicePrefix = loc;

  await ref.set({
    ...updates,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const next = { ...(snap.data() as MerchantDoc), ...updates, merchantId };
  return next;
};

export const sumMerchantReceiptBalance = async (merchantId: string): Promise<number> => {
  const db = adminDb();
  const snap = await db.collection("pay_receipts")
    .where("merchantId", "==", merchantId)
    .where("merchantCredited", "==", true)
    .get();

  return snap.docs.reduce((sum, doc) => {
    const data = doc.data();
    if (data.excludedFromBalance === true || data.status === "voided") return sum;
    return sum + Number(data.amount ?? 0);
  }, 0);
};

/** Link merchant to owner Firebase UID and migrate pooled balance into Pay Hub ledger. */
export const linkMerchantOwnerAndMigrate = async (merchantId: string, ownerUid: string) => {
  const db = adminDb();
  const merchantRef = db.collection("pay_merchants").doc(merchantId);
  const merchantSnap = await merchantRef.get();
  if (!merchantSnap.exists) throw new Error("Merchant not found");

  const merchant = merchantSnap.data() as MerchantDoc;
  const existingOwner = merchant.ownerUid?.trim();
  if (existingOwner && existingOwner !== ownerUid) {
    throw new Error("Merchant already linked to another account");
  }
  if (existingOwner === ownerUid && Number(merchant.gatBalance ?? 0) === 0) {
    return { merchantId, ownerUid, migratedGat: 0, alreadyLinked: true };
  }

  const migrateAmount = await sumMerchantReceiptBalance(merchantId);

  if (migrateAmount > 0) {
    const ownerRef = db.collection("pay_ledgers").doc(ownerUid);
    await db.runTransaction(async (tx) => {
      const ownerSnap = await tx.get(ownerRef);
      const ownerBal = ownerSnap.exists ? Number(ownerSnap.data()?.gatBalance ?? 0) : 0;
      tx.set(ownerRef, {
        uid: ownerUid,
        gatBalance: ownerBal + migrateAmount,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  }

  await merchantRef.set({
    ownerUid,
    gatBalance: 0,
    totalReceived: migrateAmount,
    ownerLinkedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { merchantId, ownerUid, migratedGat: migrateAmount };
};

export const getMerchantPoolBalanceForOwner = async (uid: string): Promise<number> => {
  const db = adminDb();
  let total = 0;

  const ownedSnap = await db.collection("pay_merchants").where("ownerUid", "==", uid).get();
  for (const doc of ownedSnap.docs) {
    total += Number(doc.data()?.gatBalance ?? 0);
  }

  const envOwner = process.env.PAY_HUB_MERCHANT_OWNER_UID?.trim();
  if (envOwner === uid) {
    const fallback = await db.collection("pay_merchants").doc(DEFAULT_MERCHANT_ID).get();
    if (fallback.exists && !fallback.data()?.ownerUid) {
      total += Number(fallback.data()?.gatBalance ?? 0);
    }
  }

  return total;
};

const DEFAULT_MERCHANT: MerchantDoc & { merchantId: string } = {
  merchantId: DEFAULT_MERCHANT_ID,
  name: "Garuda Halal Mart",
  verified: true,
  walletAddress: defaultMerchantVaultFromEnv(),
  ownerUid: process.env.PAY_HUB_MERCHANT_OWNER_UID?.trim() || null,
  gatBalance: 0,
};

const receiptCode = () =>
  `GP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const isFirestoreQuotaError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("RESOURCE_EXHAUSTED") || msg.toLowerCase().includes("quota exceeded");
};

const defaultMerchantSeed = (): MerchantDoc => {
  const { merchantId: _id, ...seed } = DEFAULT_MERCHANT;
  return seed;
};

export const ensureMerchant = async (merchantId: string): Promise<MerchantDoc> => {
  if (merchantId.startsWith("platform:")) {
    throw new Error(`Merchant not registered: ${merchantId}`);
  }

  try {
    const db = adminDb();
    const ref = db.collection("pay_merchants").doc(merchantId);
    const snap = await ref.get();
    if (snap.exists) {
      const data = snap.data() as MerchantDoc;
      if (merchantIdIsDefault(merchantId)) {
        const envVault = defaultMerchantVaultFromEnv();
        const envOwner = process.env.PAY_HUB_MERCHANT_OWNER_UID?.trim();
        const patches: Partial<MerchantDoc> = {};
        if (envVault && !isEthAddress(data.walletAddress)) patches.walletAddress = envVault;
        if (envOwner && !data.ownerUid?.trim()) patches.ownerUid = envOwner;
        if (Object.keys(patches).length) {
          try {
            await ref.set({ ...patches, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          } catch (err) {
            if (!isFirestoreQuotaError(err)) throw err;
          }
          return { ...data, ...patches };
        }
      }
      return data;
    }

    if (merchantId === DEFAULT_MERCHANT.merchantId) {
      const seed = defaultMerchantSeed();
      try {
        await ref.set({ ...seed, createdAt: FieldValue.serverTimestamp() });
      } catch (err) {
        if (!isFirestoreQuotaError(err)) throw err;
      }
      return seed;
    }

    throw new Error("Merchant not found");
  } catch (err) {
    if (merchantIdIsDefault(merchantId) && isFirestoreQuotaError(err)) {
      return defaultMerchantSeed();
    }
    throw err;
  }
};

export const creditMerchantBalance = async (
  merchantId: string,
  merchant: MerchantDoc,
  netAmount: number,
) => {
  if (netAmount <= 0) return;

  const db = adminDb();
  const merchantRef = db.collection("pay_merchants").doc(merchantId);
  const ownerUid = resolveMerchantOwnerUid(merchant);

  if (ownerUid) {
    const ownerRef = db.collection("pay_ledgers").doc(ownerUid);
    await db.runTransaction(async (tx) => {
      const ownerSnap = await tx.get(ownerRef);
      const ownerBal = ownerSnap.exists ? Number(ownerSnap.data()?.gatBalance ?? 0) : 0;
      tx.set(ownerRef, {
        uid: ownerUid,
        gatBalance: ownerBal + netAmount,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await merchantRef.set({
      totalReceived: FieldValue.increment(netAmount),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return;
  }

  await db.runTransaction(async (tx) => {
    const merchantSnap = await tx.get(merchantRef);
    const merchantBal = merchantSnap.exists ? Number(merchantSnap.data()?.gatBalance ?? 0) : 0;
    tx.set(merchantRef, {
      gatBalance: merchantBal + netAmount,
      totalReceived: FieldValue.increment(netAmount),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
};

/** Credit merchants after market_checkout buyer debit (idempotent via protocol_settlements flag). */
export const creditMarketMerchantSplits = async (
  payerUid: string,
  checkoutRef: string,
  splits: MarketMerchantSplit[],
  totalGrossGat: number,
  totalNetGat: number,
) => {
  if (!splits.length) return { credited: [] as string[] };

  const db = adminDb();
  const settlementRef = db.collection("protocol_settlements").doc(checkoutRef);
  const settlementSnap = await settlementRef.get();
  if (!settlementSnap.exists) throw new Error("Settlement not found");

  const settlement = settlementSnap.data()!;
  if (settlement.uid !== payerUid) throw new Error("Settlement mismatch");
  if (settlement.action !== "market_checkout") throw new Error("Invalid settlement action");
  if (settlement.merchantCreditsApplied === true) {
    return { credited: [] as string[] };
  }

  const netRatio = totalGrossGat > 0 ? totalNetGat / totalGrossGat : 0;
  const credited: string[] = [];

  for (const split of splits) {
    if (!split.merchantId || split.grossGat <= 0) continue;
    const netGat = split.grossGat * netRatio;
    if (netGat <= 0) continue;

    const merchantId = await resolveMarketSplitMerchantId(split.merchantId, split.orderId);
    const merchant = await ensureMerchant(merchantId);
    if (shouldMutateFirestorePayLedger("market")) {
      await creditMerchantBalance(merchantId, merchant, netGat);
    }

    await db.collection("pay_receipts").add({
      uid: payerUid,
      channel: "offchain",
      source: "market_checkout",
      merchantId,
      merchantName: merchant.name,
      amount: String(netGat),
      grossAmount: String(split.grossGat),
      token: "GAT",
      status: "confirmed",
      receiptCode: receiptCode(),
      checkoutRef,
      orderId: split.orderId ?? null,
      merchantCredited: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    credited.push(merchantId);

    const chainMarket = isOnChainWritePrimaryFor("market");
    const chainTx = await relayMarketCheckoutOnChain({
      buyerUid: payerUid,
      merchantId,
      amountGat: split.grossGat,
      checkoutRef: `${checkoutRef}:${merchantId}`,
    }).catch(() => null);
    if (chainMarket && !chainTx?.txHash) {
      throw new Error("On-chain market checkout failed");
    }
  }

  await settlementRef.update({
    merchantCreditsApplied: true,
    merchantCreditsAt: FieldValue.serverTimestamp(),
    merchantCreditIds: credited,
  });

  return { credited };
};

/** Resolve merchant ID for market split, fix stale platform default via order/product catalog. */
export const resolveMarketSplitMerchantId = async (
  merchantId: string,
  orderId?: string,
): Promise<string> => {
  const normalized = merchantId.trim().toUpperCase();
  if (!merchantIdIsDefault(normalized)) return normalized;
  if (!orderId?.trim()) return normalized;

  const db = adminDb();
  const orderSnap = await db.collection("market_orders").doc(orderId.trim()).get();
  if (!orderSnap.exists) return normalized;

  const order = orderSnap.data() as {
    merchantId?: string;
    items?: { productId?: number }[];
  };

  const orderMerchantId = order.merchantId?.trim().toUpperCase();
  if (orderMerchantId && !merchantIdIsDefault(orderMerchantId)) {
    return orderMerchantId;
  }

  const productId = order.items?.[0]?.productId;
  if (productId != null) {
    const productSnap = await db.collection("marketplace_products").doc(String(productId)).get();
    if (productSnap.exists) {
      const productMerchantId = String(productSnap.data()?.merchantId ?? "").trim().toUpperCase();
      if (productMerchantId && !merchantIdIsDefault(productMerchantId)) {
        return productMerchantId;
      }
    }
  }

  return normalized;
};

/** Debit payer and credit merchant atomically (QR Pay Hub off-chain). */
export const settleOffchainTransfer = async (
  payerUid: string,
  merchantId: string,
  merchant: MerchantDoc,
  grossAmount: number,
  netAmount: number,
  options?: { forceLedger?: boolean },
) => {
  if (!options?.forceLedger && !shouldMutateFirestorePayLedger("merchant")) return;

  const db = adminDb();
  const payerRef = db.collection("pay_ledgers").doc(payerUid);
  const merchantRef = db.collection("pay_merchants").doc(merchantId);

  await db.runTransaction(async (tx) => {
    const ownerUid = resolveLinkedOwnerUid(merchant);
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
