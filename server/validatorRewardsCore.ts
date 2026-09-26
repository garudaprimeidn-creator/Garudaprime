import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import { creditValidatorReward, deductValidatorTreasury } from "./protocolCore.js";
import { getValidatorProgramConfig } from "./platformProgramsCore.js";
import { parseStakeSda } from "./parseStakeSda.js";

const APPLICATIONS_COL = "validator_applications";
const REWARDS_COL = "validator_rewards";
const USERS_COL = "users";

export type ValidatorRewardType = "join" | "monthly";

export type ValidatorRewardEvent = {
  id: string;
  uid: string;
  applicationId: string;
  type: ValidatorRewardType;
  rewardGat: number;
  periodKey?: string | null;
  createdAt: string | null;
};

export type UserValidatorStats = {
  programEnabled: boolean;
  joinRewardGat: number;
  monthlyRewardGat: number;
  minStakeSda: number;
  application: {
    id: string;
    status: string;
    walletAddress: string;
    email: string;
    orgName: string | null;
    stakeSda: string | null;
    stakeAmount: number;
    appliedAt: string | null;
    approvedAt: string | null;
  } | null;
  canApply: boolean;
  totalEarnedGat: number;
  joinRewardPaid: boolean;
  lastMonthlyPeriod: string | null;
  history: ValidatorRewardEvent[];
};

export type AdminValidatorRewardStats = {
  activeValidators: number;
  pendingApplications: number;
  totalRewardsGat: number;
  joinRewardsPaid: number;
  monthlyPayouts: number;
  topValidators: { uid: string; name: string; earnedGat: number; walletAddress: string }[];
  recentRewards: ValidatorRewardEvent[];
};

function tsToIso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "toDate" in v) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function currentPeriodKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function recordReward(input: {
  uid: string;
  applicationId: string;
  type: ValidatorRewardType;
  rewardGat: number;
  periodKey?: string;
}) {
  const ref = adminDb().collection(REWARDS_COL).doc();
  await ref.set({
    uid: input.uid,
    applicationId: input.applicationId,
    type: input.type,
    rewardGat: input.rewardGat,
    periodKey: input.periodKey ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/** Pay one-time join reward when admin approves a validator application. */
export async function processValidatorJoinReward(applicationId: string): Promise<{
  processed: boolean;
  rewardGat?: number;
  uid?: string;
  error?: string;
}> {
  const config = await getValidatorProgramConfig();
  if (!config.enabled) return { processed: false, error: "Validator program disabled" };
  if (config.joinRewardGat <= 0) return { processed: false, error: "Join reward is zero" };

  const db = adminDb();
  const appRef = db.collection(APPLICATIONS_COL).doc(applicationId);
  const appSnap = await appRef.get();
  if (!appSnap.exists) return { processed: false, error: "Application not found" };

  const app = appSnap.data()!;
  if (app.joinRewardPaid) return { processed: false, error: "Join reward already paid" };

  const uid = String(app.uid ?? "");
  if (!uid) return { processed: false, error: "Missing applicant uid" };

  if (config.requireKycTier > 0) {
    const userSnap = await db.collection(USERS_COL).doc(uid).get();
    const tier = Number(userSnap.data()?.kycTier ?? 0);
    if (tier < config.requireKycTier) {
      return { processed: false, error: `KYC Tier ${config.requireKycTier} required` };
    }
  }

  const rewardGat = config.joinRewardGat;
  await deductValidatorTreasury(rewardGat);
  await creditValidatorReward(uid, rewardGat);
  await recordReward({ uid, applicationId, type: "join", rewardGat });

  await appRef.update({
    joinRewardPaid: true,
    joinRewardGat: rewardGat,
    joinRewardPaidAt: FieldValue.serverTimestamp(),
    totalEarnedGat: FieldValue.increment(rewardGat),
    approvedAt: app.approvedAt ?? FieldValue.serverTimestamp(),
  });

  return { processed: true, rewardGat, uid };
}

/** Pay monthly reward to all active validators for the current UTC month. */
export async function payMonthlyValidatorRewards(periodKey = currentPeriodKey()): Promise<{
  paid: number;
  skipped: number;
  totalGat: number;
  periodKey: string;
}> {
  const config = await getValidatorProgramConfig();
  if (!config.enabled || config.monthlyRewardGat <= 0) {
    return { paid: 0, skipped: 0, totalGat: 0, periodKey };
  }

  const db = adminDb();
  const snap = await db.collection(APPLICATIONS_COL).where("status", "==", "active").get();

  let paid = 0;
  let skipped = 0;
  let totalGat = 0;

  for (const doc of snap.docs) {
    const app = doc.data();
    if (app.lastMonthlyRewardPeriod === periodKey) {
      skipped++;
      continue;
    }

    const uid = String(app.uid ?? "");
    if (!uid) {
      skipped++;
      continue;
    }

    const rewardGat = config.monthlyRewardGat;
    await deductValidatorTreasury(rewardGat);
    await creditValidatorReward(uid, rewardGat);
    await recordReward({
      uid,
      applicationId: doc.id,
      type: "monthly",
      rewardGat,
      periodKey,
    });

    await doc.ref.update({
      lastMonthlyRewardPeriod: periodKey,
      lastMonthlyRewardAt: FieldValue.serverTimestamp(),
      totalEarnedGat: FieldValue.increment(rewardGat),
    });

    paid++;
    totalGat += rewardGat;
  }

  return { paid, skipped, totalGat, periodKey };
}

function appCreatedMs(data: Record<string, unknown>): number {
  const createdAt = data.createdAt;
  if (createdAt && typeof createdAt === "object" && "toDate" in createdAt) {
    return (createdAt as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

function pickPrimaryApplication(
  docs: { id: string; data: () => Record<string, unknown> }[],
) {
  const sorted = [...docs].sort((a, b) => appCreatedMs(b.data()) - appCreatedMs(a.data()));
  const active = sorted.find((doc) => String(doc.data().status ?? "") === "active");
  if (active) return active;
  const pending = sorted.find((doc) => String(doc.data().status ?? "") === "pending");
  if (pending) return pending;
  return sorted[0] ?? null;
}

function mapApplication(doc: { id: string; data: () => Record<string, unknown> }) {
  const appData = doc.data();
  const stakeRaw = appData.stakeSda ?? appData.stake ?? null;
  return {
    id: doc.id,
    status: String(appData.status ?? "pending"),
    walletAddress: String(appData.walletAddress ?? ""),
    email: String(appData.email ?? ""),
    orgName: (appData.orgName as string | null) ?? null,
    stakeSda: stakeRaw != null ? String(stakeRaw) : null,
    stakeAmount: parseStakeSda(stakeRaw),
    appliedAt: tsToIso(appData.createdAt),
    approvedAt: tsToIso(appData.approvedAt ?? appData.reviewedAt),
  };
}

export async function getUserValidatorStats(uid: string): Promise<UserValidatorStats> {
  const config = await getValidatorProgramConfig();
  const db = adminDb();

  const appsSnap = await db.collection(APPLICATIONS_COL).where("uid", "==", uid).get();
  const appDocs = appsSnap.docs;
  const primaryDoc = pickPrimaryApplication(appDocs);
  const activeDoc = appDocs.find((doc) => String(doc.data().status ?? "") === "active");
  const rewardSource = activeDoc ?? primaryDoc;
  const rewardData = rewardSource?.data();

  const rewardsSnap = await db
    .collection(REWARDS_COL)
    .where("uid", "==", uid)
    .limit(50)
    .get()
    .catch(() => null);

  const history: ValidatorRewardEvent[] =
    rewardsSnap?.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          uid,
          applicationId: String(d.applicationId ?? ""),
          type: d.type as ValidatorRewardType,
          rewardGat: Number(d.rewardGat ?? 0),
          periodKey: d.periodKey ?? null,
          createdAt: tsToIso(d.createdAt),
        };
      })
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")) ?? [];

  const totalEarnedGat = history.reduce((sum, h) => sum + h.rewardGat, 0);
  const canApply = !appDocs.some((doc) => {
    const status = String(doc.data().status ?? "pending");
    return status === "active" || status === "pending";
  });

  return {
    programEnabled: config.enabled,
    joinRewardGat: config.joinRewardGat,
    monthlyRewardGat: config.monthlyRewardGat,
    minStakeSda: config.minStakeSda,
    application: primaryDoc ? mapApplication(primaryDoc) : null,
    canApply,
    totalEarnedGat,
    joinRewardPaid: Boolean(rewardData?.joinRewardPaid),
    lastMonthlyPeriod: (rewardData?.lastMonthlyRewardPeriod as string | undefined) ?? null,
    history: history.slice(0, 20),
  };
}

export async function getAdminValidatorRewardStats(): Promise<AdminValidatorRewardStats> {
  const db = adminDb();
  const [appsSnap, rewardsSnap] = await Promise.all([
    db.collection(APPLICATIONS_COL).limit(200).get(),
    db.collection(REWARDS_COL).orderBy("createdAt", "desc").limit(100).get().catch(() => null),
  ]);

  let activeValidators = 0;
  let pendingApplications = 0;
  const earnedByUid: Record<string, { earned: number; walletAddress: string }> = {};

  for (const doc of appsSnap.docs) {
    const d = doc.data();
    const status = String(d.status ?? "pending");
    if (status === "active") activeValidators++;
    if (status === "pending") pendingApplications++;
    const uid = String(d.uid ?? "");
    if (uid && Number(d.totalEarnedGat ?? 0) > 0) {
      earnedByUid[uid] = {
        earned: Number(d.totalEarnedGat ?? 0),
        walletAddress: String(d.walletAddress ?? ""),
      };
    }
  }

  let totalRewardsGat = 0;
  let joinRewardsPaid = 0;
  let monthlyPayouts = 0;

  const recentRewards: ValidatorRewardEvent[] =
    rewardsSnap?.docs.map((doc) => {
      const d = doc.data();
      const rewardGat = Number(d.rewardGat ?? 0);
      totalRewardsGat += rewardGat;
      if (d.type === "join") joinRewardsPaid++;
      if (d.type === "monthly") monthlyPayouts++;
      return {
        id: doc.id,
        uid: String(d.uid ?? ""),
        applicationId: String(d.applicationId ?? ""),
        type: d.type as ValidatorRewardType,
        rewardGat,
        periodKey: d.periodKey ?? null,
        createdAt: tsToIso(d.createdAt),
      };
    }) ?? [];

  const topValidators = await Promise.all(
    Object.entries(earnedByUid)
      .sort((a, b) => b[1].earned - a[1].earned)
      .slice(0, 10)
      .map(async ([uid, stats]) => {
        const userSnap = await db.collection(USERS_COL).doc(uid).get();
        return {
          uid,
          name: String(userSnap.data()?.fullName ?? uid.slice(0, 8)),
          earnedGat: stats.earned,
          walletAddress: stats.walletAddress,
        };
      }),
  );

  return {
    activeValidators,
    pendingApplications,
    totalRewardsGat,
    joinRewardsPaid,
    monthlyPayouts,
    topValidators,
    recentRewards: recentRewards.slice(0, 30),
  };
}
