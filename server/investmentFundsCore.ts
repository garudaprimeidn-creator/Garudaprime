import { FieldValue } from "firebase-admin/firestore";
import { INVESTMENT_FUNDS, type InvestmentFund } from "../src/app/investData.js";
import { adminDb } from "./firebaseAdmin.js";

export const INVESTMENT_FUNDS_DOC = "platform_config/investment_funds";

export type FundSlotOverride = {
  raised?: number;
  capacityUsd?: number;
  round?: string;
  active?: boolean;
};

export type InvestmentFundsDoc = {
  round?: string;
  funds?: Record<string, FundSlotOverride>;
  updatedAt?: FirebaseFirestore.Timestamp | string;
};

function clampRaised(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
}

export function mergeFundWithOverride(
  base: InvestmentFund,
  override?: FundSlotOverride,
  globalRound?: string,
): InvestmentFund {
  if (!override && !globalRound) return { ...base };
  return {
    ...base,
    raised: override?.raised ?? base.raised,
    capacityUsd: override?.capacityUsd ?? base.capacityUsd,
    round: override?.round ?? globalRound ?? base.round,
  };
}

export async function getInvestmentFundsConfig(): Promise<{
  funds: InvestmentFund[];
  source: "default" | "firestore";
  round?: string;
  updatedAt?: string | null;
}> {
  const db = adminDb();
  const snap = await db.doc(INVESTMENT_FUNDS_DOC).get();
  if (!snap.exists) {
    return { funds: INVESTMENT_FUNDS.map((f) => ({ ...f })), source: "default" };
  }

  const doc = snap.data() as InvestmentFundsDoc;
  const overrides = doc.funds ?? {};
  const funds = INVESTMENT_FUNDS.map((base) => {
    const o = overrides[String(base.id)];
    if (o?.active === false) return null;
    return mergeFundWithOverride(base, o, doc.round);
  }).filter((f): f is InvestmentFund => f !== null);

  return {
    funds,
    source: "firestore",
    round: doc.round,
    updatedAt:
      doc.updatedAt && typeof doc.updatedAt !== "string"
        ? doc.updatedAt.toDate?.()?.toISOString() ?? null
        : (doc.updatedAt as string | undefined) ?? null,
  };
}

export async function saveInvestmentFundsConfig(input: {
  round?: string;
  funds: Record<string, FundSlotOverride>;
}): Promise<{ funds: InvestmentFund[]; source: "firestore" }> {
  const db = adminDb();
  const normalized: Record<string, FundSlotOverride> = {};
  for (const [id, o] of Object.entries(input.funds)) {
    normalized[id] = {
      ...o,
      ...(o.raised !== undefined ? { raised: clampRaised(o.raised) } : {}),
    };
  }

  await db.doc(INVESTMENT_FUNDS_DOC).set(
    {
      round: input.round,
      funds: normalized,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const result = await getInvestmentFundsConfig();
  return { funds: result.funds, source: "firestore" };
}

/** Reset slot untuk gelombang baru, raised default ~18% per fund */
export async function openNewInvestmentRound(roundLabel: string): Promise<{
  funds: InvestmentFund[];
  source: "firestore";
}> {
  const resets: Record<string, FundSlotOverride> = {};
  for (const f of INVESTMENT_FUNDS) {
    resets[String(f.id)] = { raised: 15 + (f.id % 4) * 3, round: roundLabel };
  }
  return saveInvestmentFundsConfig({ round: roundLabel, funds: resets });
}

/** Tambah % terkumpul saat investasi berhasil */
export async function incrementFundRaised(fundId: number, amountUsd: number): Promise<void> {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return;

  const db = adminDb();
  const ref = db.doc(INVESTMENT_FUNDS_DOC);
  const base = INVESTMENT_FUNDS.find((f) => f.id === fundId);
  if (!base) return;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const doc = (snap.exists ? snap.data() : {}) as InvestmentFundsDoc;
    const overrides = { ...(doc.funds ?? {}) };
    const key = String(fundId);
    const current = overrides[key]?.raised ?? base.raised;
    const capacity = overrides[key]?.capacityUsd ?? base.capacityUsd;
    const bump = capacity > 0 ? (amountUsd / capacity) * 100 : 0.5;
    overrides[key] = { ...overrides[key], raised: clampRaised(current + bump) };
    tx.set(
      ref,
      { funds: overrides, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  });
}
