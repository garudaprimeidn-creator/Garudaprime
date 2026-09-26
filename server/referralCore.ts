import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import { getReferralProgramConfig } from "./platformProgramsCore.js";
import { isReferralUsageEnabled } from "./referralProgramGate.js";
import { payReferralReward, getReferralPayoutReadiness } from "./referralPayoutCore.js";
import { referralBonusTiers } from "../src/lib/referral/referralRewardPolicy.js";

const REFERRAL_COL = "referrals";
const USERS_COL = "users";

const slugifyReferral = (value: string, maxLen = 10) =>
  value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, maxLen);

const isWalletDisplayName = (name: string) => {
  const n = name.trim();
  if (/^0x[a-fA-F0-9]{40}$/i.test(n)) return true;
  return /^0x[a-fA-F0-9]{2,8}(?:\.{3}|…)[a-fA-F0-9]{2,8}$/i.test(n);
};

export function buildReferralCode(
  fullName?: string | null,
  email?: string | null,
  uid?: string | null,
): string {
  const name = fullName?.trim() ?? "";
  if (name && !isWalletDisplayName(name)) {
    const slug = slugifyReferral(name);
    if (slug) return `GARUDA-${slug}-PRIME`;
  }
  if (email) {
    const slug = slugifyReferral(email.split("@")[0] ?? "");
    if (slug) return `GARUDA-${slug}-PRIME`;
  }
  if (uid) return `GARUDA-${slugifyReferral(uid)}-PRIME`;
  return "GARUDA-PRIME";
}

async function allocateUniqueReferralCode(
  fullName?: string | null,
  email?: string | null,
  uid?: string | null,
): Promise<string> {
  const base = buildReferralCode(fullName, email, uid);
  const db = adminDb();
  const owner = await db.collection(USERS_COL).where("referralCode", "==", base).limit(1).get();
  if (owner.empty || owner.docs[0]!.id === uid) return base;

  const suffix = slugifyReferral(uid ?? "", 4) || "X";
  const withSuffix = base.replace(/-PRIME$/, `-${suffix}-PRIME`);
  const clash = await db.collection(USERS_COL).where("referralCode", "==", withSuffix).limit(1).get();
  if (clash.empty || clash.docs[0]!.id === uid) return withSuffix;

  return `GARUDA-${slugifyReferral(uid ?? "USER")}-PRIME`;
}

export async function refreshUserReferralCode(uid: string): Promise<string> {
  const db = adminDb();
  const ref = db.collection(USERS_COL).doc(uid);
  const snap = await ref.get();
  const data = snap.data();
  const code = await allocateUniqueReferralCode(
    data?.fullName as string | undefined,
    data?.email as string | undefined,
    uid,
  );
  const existing = data?.referralCode as string | undefined;
  if (existing !== code) {
    await ref.set({ referralCode: code, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return code;
}

export async function ensureUserReferralCode(uid: string, email?: string | null): Promise<string> {
  const db = adminDb();
  const ref = db.collection(USERS_COL).doc(uid);
  const snap = await ref.get();
  const data = snap.data();
  const fullName = data?.fullName as string | undefined;
  const resolvedEmail = email ?? (data?.email as string | undefined);
  const code = await allocateUniqueReferralCode(fullName, resolvedEmail, uid);
  const existing = data?.referralCode as string | undefined;
  if (existing === code) return code;
  await ref.set({ referralCode: code, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return code;
}

export async function resolveReferrerUid(code: string): Promise<string | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const db = adminDb();
  const snap = await db.collection(USERS_COL).where("referralCode", "==", normalized).limit(1).get();
  if (!snap.empty) return snap.docs[0]!.id;

  // Fallback: match by email slug or name slug in GARUDA-{SLUG}-PRIME
  const match = normalized.match(/^GARUDA-([A-Z0-9]+)-PRIME$/);
  if (!match) return null;
  const slug = match[1];
  const users = await db.collection(USERS_COL).limit(500).get();
  for (const doc of users.docs) {
    const data = doc.data();
    const email = String(data.email ?? "");
    const fullName = String(data.fullName ?? "");
    const emailSlug = slugifyReferral(email.split("@")[0] ?? "");
    const nameSlug = fullName && !isWalletDisplayName(fullName) ? slugifyReferral(fullName) : "";
    if (emailSlug === slug || nameSlug === slug) {
      await doc.ref.set({ referralCode: normalized }, { merge: true });
      return doc.id;
    }
  }
  return null;
}

/** Bind referral code at registration, one time only (single-sponsor). */
function canBindSponsorAtRegistration(user: FirebaseFirestore.DocumentData | undefined): boolean {
  if (!user) return true;
  if (user.referredByUid) return false;
  const kyc = String(user.kycStatus ?? "none").toLowerCase();
  return kyc === "none" || kyc === "";
}

export async function bindReferralCode(referredUid: string, code: string): Promise<{ ok: boolean; referrerUid?: string; error?: string }> {
  const config = await getReferralProgramConfig();
  if (!config.enabled) return { ok: false, error: "Referral program disabled" };

  const referrerUid = await resolveReferrerUid(code);
  if (!referrerUid) return { ok: false, error: "Invalid referral code" };
  if (referrerUid === referredUid) return { ok: false, error: "Cannot use your own code" };

  const db = adminDb();
  const userRef = db.collection(USERS_COL).doc(referredUid);
  const userSnap = await userRef.get();
  const userData = userSnap.data();

  if (userData?.referredByUid) {
    return { ok: false, error: "Sponsor already bound, single use only" };
  }
  if (!canBindSponsorAtRegistration(userData)) {
    return {
      ok: false,
      error: "Sponsor code can only be used once during registration",
    };
  }

  const normalized = code.trim().toUpperCase();
  await userRef.set(
    {
      referredByUid: referrerUid,
      referredByCode: normalized,
      referralBoundAt: FieldValue.serverTimestamp(),
      sponsorBinding: "registration",
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await db.collection(REFERRAL_COL).add({
    referrerUid,
    referredUid,
    code: normalized,
    status: "pending",
    baseRewardGat: config.baseRewardGat,
    tierBonusGat: 0,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, referrerUid };
}

function isKycVerifiedStatus(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "verified" || s === "approved";
}

function readUserKycTier(user: FirebaseFirestore.DocumentData | undefined): number {
  return Number(user?.kycTier ?? 0);
}

function isUserEligibleForReferralReward(
  user: FirebaseFirestore.DocumentData | undefined,
  requireKycTier: number,
): boolean {
  if (!user) return false;
  return isKycVerifiedStatus(user.kycStatus) && readUserKycTier(user) >= requireKycTier;
}

/** Pay milestone tier bonuses for a referrer (idempotent). */
export async function processReferrerTierBonuses(referrerUid: string): Promise<{
  tierBonus: number;
  tiersPaid: number[];
}> {
  const config = await getReferralProgramConfig();
  if (!config.enabled || config.autoReward === false || !isReferralUsageEnabled(config)) {
    return { tierBonus: 0, tiersPaid: [] };
  }

  const db = adminDb();
  const completedSnap = await db.collection(REFERRAL_COL).where("referrerUid", "==", referrerUid).get();
  const completedCount = completedSnap.docs.filter((d) => d.data().status === "completed").length;

  const referrerRef = db.collection(USERS_COL).doc(referrerUid);
  const referrerSnap = await referrerRef.get();
  const paidTiers: number[] = referrerSnap.data()?.referralTierBonusesPaid ?? [];

  let tierBonus = 0;
  const tiersPaid: number[] = [];
  const bonusTiers = referralBonusTiers(config);

  for (const tier of bonusTiers) {
    if (completedCount < tier.minReferrals || paidTiers.includes(tier.minReferrals)) continue;

    const payout = await payReferralReward({
      referrerUid,
      amountGat: tier.bonusGat,
      payoutKind: "tier_bonus",
      idempotencyKey: `referral-tier-${referrerUid}-${tier.minReferrals}`,
      tierMinReferrals: tier.minReferrals,
    });
    if (!payout.paid) continue;

    tierBonus += tier.bonusGat;
    paidTiers.push(tier.minReferrals);
    tiersPaid.push(tier.minReferrals);
  }

  if (tiersPaid.length === 0) return { tierBonus: 0, tiersPaid: [] };

  await referrerRef.set(
    { referralTierBonusesPaid: paidTiers, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  for (const minReferrals of tiersPaid) {
    const tier = bonusTiers.find((t) => t.minReferrals === minReferrals);
    await db.collection(REFERRAL_COL).add({
      referrerUid,
      referredUid: `tier_bonus_${minReferrals}`,
      code: "TIER_BONUS",
      status: "tier_bonus",
      baseRewardGat: 0,
      tierBonusGat: tier?.bonusGat ?? 0,
      tierLabel: tier?.label ?? `${minReferrals} referrals`,
      minReferrals,
      completedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  return { tierBonus, tiersPaid };
}

/** Auto-detect KYC from Firestore and pay base + tier rewards. */
export async function processReferralAutoForUser(referredUid: string): Promise<{
  processed: boolean;
  referrerUid?: string;
  baseReward?: number;
  tierBonus?: number;
  reason?: string;
}> {
  const config = await getReferralProgramConfig();
  if (!config.enabled) return { processed: false, reason: "disabled" };
  if (config.autoReward === false) return { processed: false, reason: "auto_reward_off" };
  if (!isReferralUsageEnabled(config)) return { processed: false, reason: "referral_locked" };

  const db = adminDb();
  const userSnap = await db.collection(USERS_COL).doc(referredUid).get();
  const user = userSnap.data();
  if (!user?.referredByUid) return { processed: false, reason: "not_referred" };
  if (user.referralRewardPaid) return { processed: false, reason: "already_paid" };

  const kycTier = readUserKycTier(user);
  if (!isUserEligibleForReferralReward(user, config.requireKycTier)) {
    return { processed: false, reason: "kyc_not_eligible" };
  }

  return processReferralOnKycApproved(referredUid, kycTier);
}

/** Process all pending referrals for a referrer (referred users already KYC-verified). */
export async function syncReferrerPendingRewards(referrerUid: string): Promise<number> {
  const config = await getReferralProgramConfig();
  if (!config.enabled || config.autoReward === false || !isReferralUsageEnabled(config)) return 0;

  const db = adminDb();
  const refsSnap = await db.collection(REFERRAL_COL).where("referrerUid", "==", referrerUid).get();
  let processed = 0;

  for (const doc of refsSnap.docs) {
    if (doc.data().status !== "pending") continue;
    const referredUid = String(doc.data().referredUid ?? "");
    if (!referredUid || referredUid.startsWith("tier_bonus_")) continue;
    const result = await processReferralAutoForUser(referredUid);
    if (result.processed) processed++;
  }

  await processReferrerTierBonuses(referrerUid);
  return processed;
}

/** Main auto-reward engine, run on stats fetch, sync, and KYC events. */
export async function runReferralAutoRewardEngine(uid: string): Promise<{
  baseProcessed: boolean;
  pendingSynced: number;
  tierBonus: number;
}> {
  const config = await getReferralProgramConfig();
  if (!config.enabled || config.autoReward === false || !isReferralUsageEnabled(config)) {
    return { baseProcessed: false, pendingSynced: 0, tierBonus: 0 };
  }

  const selfResult = await processReferralAutoForUser(uid);
  const pendingSynced = await syncReferrerPendingRewards(uid);
  const tierResult = await processReferrerTierBonuses(uid);

  return {
    baseProcessed: selfResult.processed,
    pendingSynced,
    tierBonus: tierResult.tierBonus,
  };
}

/** Admin/cron: scan pending referral events and auto-pay eligible users. */
export async function syncAllPendingReferralRewards(limit = 200): Promise<{
  scanned: number;
  processed: number;
  tierBonusesGat: number;
}> {
  const config = await getReferralProgramConfig();
  if (!config.enabled || config.autoReward === false || !isReferralUsageEnabled(config)) {
    return { scanned: 0, processed: 0, tierBonusesGat: 0 };
  }

  const db = adminDb();
  const snap = await db.collection(REFERRAL_COL).orderBy("createdAt", "desc").limit(limit).get();
  const pendingUids = new Set<string>();
  const referrerUids = new Set<string>();

  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.status === "pending" && d.referredUid) {
      pendingUids.add(String(d.referredUid));
      if (d.referrerUid) referrerUids.add(String(d.referrerUid));
    }
  }

  let processed = 0;
  for (const referredUid of pendingUids) {
    const result = await processReferralAutoForUser(referredUid);
    if (result.processed) processed++;
  }

  let tierBonusesGat = 0;
  for (const referrerUid of referrerUids) {
    const tier = await processReferrerTierBonuses(referrerUid);
    tierBonusesGat += tier.tierBonus;
  }

  return { scanned: pendingUids.size, processed, tierBonusesGat };
}

/** Called when referred user reaches required KYC tier */
export async function processReferralOnKycApproved(referredUid: string, kycTier: number): Promise<{
  processed: boolean;
  referrerUid?: string;
  baseReward?: number;
  tierBonus?: number;
}> {
  const config = await getReferralProgramConfig();
  if (!config.enabled) return { processed: false };
  if (!isReferralUsageEnabled(config)) return { processed: false };
  if (kycTier < config.requireKycTier) return { processed: false };

  const db = adminDb();
  const userSnap = await db.collection(USERS_COL).doc(referredUid).get();
  const user = userSnap.data();
  if (!user?.referredByUid) return { processed: false };
  if (user.referralRewardPaid) return { processed: false };

  const referrerUid = user.referredByUid as string;

  const pendingSnap = await db
    .collection(REFERRAL_COL)
    .where("referredUid", "==", referredUid)
    .limit(5)
    .get();
  const pendingDoc = pendingSnap.docs.find((d) => d.data().status === "pending");

  const baseReward = config.baseRewardGat;
  const payout = await payReferralReward({
    referrerUid,
    amountGat: baseReward,
    payoutKind: "base",
    idempotencyKey: `referral-base-${referredUid}`,
    referredUid,
  });
  if (!payout.paid) return { processed: false };

  if (pendingDoc) {
    await pendingDoc.ref.update({
      status: "completed",
      baseRewardGat: baseReward,
      completedAt: FieldValue.serverTimestamp(),
      autoReward: true,
    });
  }

  await userSnap.ref.update({
    referralRewardPaid: true,
    referralRewardPaidAt: FieldValue.serverTimestamp(),
  });

  const tierResult = await processReferrerTierBonuses(referrerUid);

  return {
    processed: true,
    referrerUid,
    baseReward,
    tierBonus: tierResult.tierBonus || undefined,
  };
}

export type UserReferralStats = {
  referralCode: string;
  canBindReferral: boolean;
  singleSponsor: boolean;
  referredByCode: string | null;
  totalReferred: number;
  completed: number;
  pending: number;
  totalEarnedGat: number;
  pendingRewardGat: number;
  tierBonusesTotal: number;
  conversionPct: number;
  autoReward: boolean;
  rewardPolicy: {
    baseRewardGat: number;
    requireKycTier: number;
    distributionMode: "locked" | "pay_hub" | "sidra_treasury";
    payoutReady: boolean;
    lockedUntilTokenLaunch: boolean;
    usageEnabled: boolean;
  };
  nextTier: { minReferrals: number; bonusGat: number; label: string; remaining: number } | null;
  history: {
    referredUid: string;
    name: string;
    status: string;
    date: string | null;
    rewardGat: number;
  }[];
};

export async function getUserReferralStats(uid: string, email?: string | null): Promise<UserReferralStats> {
  const config = await getReferralProgramConfig();
  const payoutReadiness = await getReferralPayoutReadiness();

  if (config.enabled && config.autoReward !== false && isReferralUsageEnabled(config)) {
    await runReferralAutoRewardEngine(uid);
  }

  const db = adminDb();
  const userSnap = await db.collection(USERS_COL).doc(uid).get();
  const userData = userSnap.data();
  const code = await ensureUserReferralCode(uid, email);
  const canBindReferral = false;
  const referredByCode = userData?.referredByCode ? String(userData.referredByCode) : null;
  const paidTiers: number[] = userData?.referralTierBonusesPaid ?? [];

  const refsSnap = await db.collection(REFERRAL_COL).where("referrerUid", "==", uid).get();
  const referralRows = refsSnap.docs
    .filter((d) => d.data().code !== "TIER_BONUS")
    .map((d) => d.data());

  const history: UserReferralStats["history"] = [];
  let completed = 0;
  let pending = 0;
  let totalEarnedGat = 0;
  let pendingRewardGat = 0;
  let tierBonusesTotal = 0;

  for (const row of referralRows) {
    const referredUid = row.referredUid as string;
    const refUserSnap = await db.collection(USERS_COL).doc(referredUid).get();
    const name = String(refUserSnap.data()?.fullName ?? "User");
    const status = row.status as string;
    if (status === "completed") {
      completed++;
      totalEarnedGat += Number(row.baseRewardGat ?? config.baseRewardGat);
    } else if (status === "pending") {
      pending++;
      pendingRewardGat += config.baseRewardGat;
    }
    const ts = row.completedAt ?? row.createdAt;
    const date =
      ts && typeof ts === "object" && "toDate" in ts
        ? (ts as { toDate: () => Date }).toDate().toISOString()
        : null;
    history.push({
      referredUid,
      name,
      status,
      date,
      rewardGat: status === "completed" ? Number(row.baseRewardGat ?? config.baseRewardGat) : 0,
    });
  }

  const tierBonuses = refsSnap.docs.filter((d) => d.data().status === "tier_bonus");
  for (const doc of tierBonuses) {
    const bonus = Number(doc.data().tierBonusGat ?? 0);
    tierBonusesTotal += bonus;
    totalEarnedGat += bonus;
    const ts = doc.data().completedAt ?? doc.data().createdAt;
    const date =
      ts && typeof ts === "object" && "toDate" in ts
        ? (ts as { toDate: () => Date }).toDate().toISOString()
        : null;
    history.push({
      referredUid: String(doc.data().referredUid ?? "tier_bonus"),
      name: String(doc.data().tierLabel ?? "Tier Bonus"),
      status: "tier_bonus",
      date,
      rewardGat: bonus,
    });
  }

  history.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const totalReferred = referralRows.length;
  const conversionPct = totalReferred > 0 ? Math.round((completed / totalReferred) * 100) : 0;

  const bonusTiers = referralBonusTiers(config);
  const nextTierDef = bonusTiers.find(
    (t) => completed < t.minReferrals && !paidTiers.includes(t.minReferrals),
  );
  const nextTier = nextTierDef
    ? {
        minReferrals: nextTierDef.minReferrals,
        bonusGat: nextTierDef.bonusGat,
        label: nextTierDef.label,
        remaining: nextTierDef.minReferrals - completed,
      }
    : null;

  return {
    referralCode: code,
    canBindReferral,
    singleSponsor: true,
    referredByCode,
    totalReferred,
    completed,
    pending,
    totalEarnedGat,
    pendingRewardGat,
    tierBonusesTotal,
    conversionPct,
    autoReward: config.autoReward !== false,
    rewardPolicy: {
      baseRewardGat: config.baseRewardGat,
      requireKycTier: config.requireKycTier,
      distributionMode: payoutReadiness.distributionMode,
      payoutReady: payoutReadiness.payoutReady,
      lockedUntilTokenLaunch: payoutReadiness.lockedUntilTokenLaunch,
      usageEnabled: payoutReadiness.usageEnabled,
    },
    nextTier,
    history: history.slice(0, 20),
  };
}

export type AdminReferralStats = {
  totalEvents: number;
  completed: number;
  pending: number;
  totalRewardsGat: number;
  topReferrers: { uid: string; name: string; count: number; earnedGat: number }[];
  recentEvents: {
    id: string;
    referrerUid: string;
    referredUid: string;
    status: string;
    baseRewardGat: number;
    tierBonusGat: number;
    createdAt: string | null;
  }[];
};

export async function getAdminReferralStats(): Promise<AdminReferralStats> {
  const db = adminDb();
  const config = await getReferralProgramConfig();
  const snap = await db.collection(REFERRAL_COL).orderBy("createdAt", "desc").limit(200).get();

  let completed = 0;
  let pending = 0;
  let totalRewardsGat = 0;
  const byReferrer: Record<string, { count: number; earned: number }> = {};

  const recentEvents = snap.docs.map((doc) => {
    const d = doc.data();
    const status = String(d.status ?? "pending");
    if (status === "completed") {
      completed++;
      totalRewardsGat += Number(d.baseRewardGat ?? config.baseRewardGat);
    } else if (status === "pending") pending++;
    else if (status === "tier_bonus") totalRewardsGat += Number(d.tierBonusGat ?? 0);

    const refUid = String(d.referrerUid ?? "");
    if (refUid && status === "completed") {
      byReferrer[refUid] = byReferrer[refUid] ?? { count: 0, earned: 0 };
      byReferrer[refUid].count++;
      byReferrer[refUid].earned += Number(d.baseRewardGat ?? config.baseRewardGat);
    }

    const ts = d.createdAt;
    const createdAt =
      ts && typeof ts === "object" && "toDate" in ts
        ? (ts as { toDate: () => Date }).toDate().toISOString()
        : null;

    return {
      id: doc.id,
      referrerUid: refUid,
      referredUid: String(d.referredUid ?? ""),
      status,
      baseRewardGat: Number(d.baseRewardGat ?? 0),
      tierBonusGat: Number(d.tierBonusGat ?? 0),
      createdAt,
    };
  });

  const topReferrers: AdminReferralStats["topReferrers"] = [];
  for (const [uid, stats] of Object.entries(byReferrer)) {
    const userSnap = await db.collection(USERS_COL).doc(uid).get();
    topReferrers.push({
      uid,
      name: String(userSnap.data()?.fullName ?? uid.slice(0, 8)),
      count: stats.count,
      earnedGat: stats.earned,
    });
  }
  topReferrers.sort((a, b) => b.count - a.count);

  return {
    totalEvents: snap.size,
    completed,
    pending,
    totalRewardsGat,
    topReferrers: topReferrers.slice(0, 10),
    recentEvents: recentEvents.slice(0, 30),
  };
}
