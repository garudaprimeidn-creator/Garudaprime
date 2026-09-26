import { FieldValue } from "firebase-admin/firestore";
import { STAKING_PRODUCTS, type StakingProduct } from "../src/lib/invest/investPortfolio.js";
import { REFERRAL_REWARD_POLICY } from "../src/lib/referral/referralRewardPolicy.js";
import { adminDb } from "./firebaseAdmin.js";
import {
  readPlatformProgramsBlob,
  type PlatformProgramsBlobCache,
} from "../lib/platform-config-blob.js";
import { loadCommunityConfigStorage } from "./platformConfigStorage.js";

export const STAKING_DOC = "platform_config/staking_products";
export const REFERRAL_DOC = "platform_config/referral_program";
export const COMMUNITY_DOC = "platform_config/community_program";
export const TOKEN_PRICES_DOC = "platform_config/token_prices";
export const VALIDATOR_DOC = "platform_config/validator_program";

export type TokenPricesConfig = {
  prices: Record<string, number>;
  updatedAt?: string | null;
};

const DEFAULT_TOKEN_PRICES: Record<string, number> = {
  GAT: 0,
  SDA: 0,
  USDT: 1,
  ETH: 3850,
};

export type StakingProductOverride = {
  apr?: number;
  lockDays?: number;
  minAmount?: number;
  /** @deprecated use minAmount */
  minGat?: number;
  active?: boolean;
};

export type ReferralTier = {
  minReferrals: number;
  bonusGat: number;
  label: string;
};

export type ReferralProgramConfig = {
  enabled: boolean;
  autoReward: boolean;
  baseRewardGat: number;
  requireKycTier: number;
  tiers: ReferralTier[];
  updatedAt?: string | null;
};

export type ValidatorProgramConfig = {
  enabled: boolean;
  joinRewardGat: number;
  monthlyRewardGat: number;
  minStakeSda: number;
  requireKycTier: number;
  updatedAt?: string | null;
};

export type CommunityProgramConfig = {
  zakat: {
    enabled: boolean;
    nisabRateBps: number;
    protocolFeeBps: number;
  };
  charity: {
    enabled: boolean;
    presetAmountsGat: number[];
    protocolFeeBps: number;
  };
  overview: {
    members: string;
    volume: string;
    countries: string;
  };
  updatedAt?: string | null;
};

const DEFAULT_VALIDATOR: ValidatorProgramConfig = {
  enabled: true,
  joinRewardGat: 500,
  monthlyRewardGat: 100,
  minStakeSda: 10000,
  requireKycTier: 2,
};

const DEFAULT_REFERRAL: ReferralProgramConfig = {
  enabled: true,
  autoReward: REFERRAL_REWARD_POLICY.autoReward,
  baseRewardGat: REFERRAL_REWARD_POLICY.baseRewardGat,
  requireKycTier: REFERRAL_REWARD_POLICY.requireKycTier,
  tiers: [...REFERRAL_REWARD_POLICY.tiers],
};

const DEFAULT_COMMUNITY: CommunityProgramConfig = {
  zakat: { enabled: true, nisabRateBps: 250, protocolFeeBps: 10 },
  charity: { enabled: true, presetAmountsGat: [25, 50, 100, 250], protocolFeeBps: 10 },
  overview: { members: "87K+", volume: "$1.2M", countries: "27+" },
};

function tsToIso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "toDate" in v) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export async function getStakingProductsConfig(): Promise<{
  products: StakingProduct[];
  source: "default" | "firestore";
  updatedAt?: string | null;
}> {
  const snap = await adminDb().doc(STAKING_DOC).get();
  if (!snap.exists) {
    return { products: STAKING_PRODUCTS.map((p) => ({ ...p })), source: "default" };
  }
  const doc = snap.data() as { products?: Record<string, StakingProductOverride>; updatedAt?: unknown };
  const overrides = doc.products ?? {};
  const products = STAKING_PRODUCTS.map((base) => {
    const o = overrides[base.id];
    if (o?.active === false) return null;
    return {
      ...base,
      apr: o?.apr ?? base.apr,
      lockDays: o?.lockDays ?? base.lockDays,
      minAmount: o?.minAmount ?? o?.minGat ?? base.minAmount,
    };
  }).filter((p): p is StakingProduct => p !== null);

  return { products, source: "firestore", updatedAt: tsToIso(doc.updatedAt) };
}

export async function saveStakingProductsConfig(
  products: Record<string, StakingProductOverride>,
): Promise<{ products: StakingProduct[]; source: "firestore" }> {
  await adminDb().doc(STAKING_DOC).set(
    { products, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  const result = await getStakingProductsConfig();
  return { products: result.products, source: "firestore" };
}

export async function getReferralProgramConfig(): Promise<
  ReferralProgramConfig & { source: "default" | "firestore" }
> {
  const snap = await adminDb().doc(REFERRAL_DOC).get();
  if (!snap.exists) return { ...DEFAULT_REFERRAL, source: "default" };
  const d = snap.data() as Partial<ReferralProgramConfig>;
  return {
    enabled: d.enabled ?? DEFAULT_REFERRAL.enabled,
    autoReward: d.autoReward ?? DEFAULT_REFERRAL.autoReward,
    baseRewardGat: d.baseRewardGat ?? DEFAULT_REFERRAL.baseRewardGat,
    requireKycTier: d.requireKycTier ?? DEFAULT_REFERRAL.requireKycTier,
    tiers: d.tiers?.length ? d.tiers : DEFAULT_REFERRAL.tiers,
    updatedAt: tsToIso(d.updatedAt),
    source: "firestore",
  };
}

export async function saveReferralProgramConfig(
  config: Omit<ReferralProgramConfig, "updatedAt">,
): Promise<ReferralProgramConfig & { source: "firestore" }> {
  await adminDb().doc(REFERRAL_DOC).set(
    { ...config, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  const result = await getReferralProgramConfig();
  return { ...result, source: "firestore" };
}

export async function getValidatorProgramConfig(): Promise<
  ValidatorProgramConfig & { source: "default" | "firestore" }
> {
  const snap = await adminDb().doc(VALIDATOR_DOC).get();
  if (!snap.exists) return { ...DEFAULT_VALIDATOR, source: "default" };
  const d = snap.data() as Partial<ValidatorProgramConfig>;
  return {
    enabled: d.enabled ?? DEFAULT_VALIDATOR.enabled,
    joinRewardGat: d.joinRewardGat ?? DEFAULT_VALIDATOR.joinRewardGat,
    monthlyRewardGat: d.monthlyRewardGat ?? DEFAULT_VALIDATOR.monthlyRewardGat,
    minStakeSda: d.minStakeSda ?? DEFAULT_VALIDATOR.minStakeSda,
    requireKycTier: d.requireKycTier ?? DEFAULT_VALIDATOR.requireKycTier,
    updatedAt: tsToIso(d.updatedAt),
    source: "firestore",
  };
}

export async function saveValidatorProgramConfig(
  config: Omit<ValidatorProgramConfig, "updatedAt">,
): Promise<ValidatorProgramConfig & { source: "firestore" }> {
  await adminDb().doc(VALIDATOR_DOC).set(
    { ...config, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  const result = await getValidatorProgramConfig();
  return { ...result, source: "firestore" };
}

function communityFromBlob(cache: PlatformProgramsBlobCache) {
  const c = cache.community;
  if (!c) return null;
  return {
    zakat: { ...DEFAULT_COMMUNITY.zakat, ...c.zakat },
    charity: { ...DEFAULT_COMMUNITY.charity, ...c.charity },
    overview: { ...DEFAULT_COMMUNITY.overview, ...c.overview },
    updatedAt: c.updatedAt ?? cache.updatedAt ?? null,
    source: "cache" as const,
  };
}

export async function getCommunityProgramConfig(): Promise<
  CommunityProgramConfig & { source: "default" | "firestore" | "cache" }
> {
  try {
    const snap = await adminDb().doc(COMMUNITY_DOC).get();
    if (!snap.exists) return { ...DEFAULT_COMMUNITY, source: "default" };
    const d = snap.data() as Partial<CommunityProgramConfig>;
    return {
      zakat: { ...DEFAULT_COMMUNITY.zakat, ...d.zakat },
      charity: { ...DEFAULT_COMMUNITY.charity, ...d.charity },
      overview: { ...DEFAULT_COMMUNITY.overview, ...d.overview },
      updatedAt: tsToIso(d.updatedAt),
      source: "firestore",
    };
  } catch {
    const cached = await readPlatformProgramsBlob();
    const fromBlob = cached ? communityFromBlob(cached) : null;
    if (fromBlob) return fromBlob;
    const stored = await loadCommunityConfigStorage();
    if (stored) {
      return {
        zakat: { ...DEFAULT_COMMUNITY.zakat, ...stored.zakat },
        charity: { ...DEFAULT_COMMUNITY.charity, ...stored.charity },
        overview: { ...DEFAULT_COMMUNITY.overview, ...stored.overview },
        source: "storage" as const,
      };
    }
    return { ...DEFAULT_COMMUNITY, source: "default" };
  }
}

export async function saveCommunityProgramConfig(
  config: Omit<CommunityProgramConfig, "updatedAt">,
): Promise<CommunityProgramConfig & { source: "firestore" }> {
  await adminDb().doc(COMMUNITY_DOC).set(
    { ...config, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  const result = await getCommunityProgramConfig();
  return { ...result, source: "firestore" };
}

export async function getPlatformProgramsBundle() {
  const blobCache = await readPlatformProgramsBlob();

  const safe = async <T>(read: () => Promise<T>, blobFallback: () => T | null): Promise<T> => {
    try {
      return await read();
    } catch {
      const fb = blobFallback();
      if (fb !== null) return fb;
      throw new Error("Firestore read failed and no blob cache");
    }
  };

  try {
    const [staking, referral, community, tokenPrices, validator] = await Promise.all([
      safe(
        () => getStakingProductsConfig(),
        () =>
          blobCache?.staking?.products?.length
            ? {
                products: blobCache.staking.products as StakingProduct[],
                source: "cache" as const,
                updatedAt: blobCache.staking.updatedAt ?? null,
              }
            : null,
      ),
      safe(
        () => getReferralProgramConfig(),
        () =>
          blobCache?.referral
            ? ({ ...DEFAULT_REFERRAL, ...blobCache.referral, source: "cache" as const } as ReferralProgramConfig & {
                source: "cache";
              })
            : null,
      ),
      safe(() => getCommunityProgramConfig(), () => (blobCache ? communityFromBlob(blobCache) : null)),
      safe(
        () => getTokenPricesConfig(),
        () =>
          blobCache?.tokenPrices?.prices
            ? {
                prices: { ...DEFAULT_TOKEN_PRICES, ...blobCache.tokenPrices.prices },
                source: "cache" as const,
                updatedAt: blobCache.tokenPrices.updatedAt ?? null,
              }
            : null,
      ),
      safe(
        () => getValidatorProgramConfig(),
        () =>
          blobCache?.validator
            ? ({ ...DEFAULT_VALIDATOR, ...blobCache.validator, source: "cache" as const } as ValidatorProgramConfig & {
                source: "cache";
              })
            : null,
      ),
    ]);
    return { staking, referral, community, tokenPrices, validator };
  } catch {
    return {
      staking: { products: STAKING_PRODUCTS.map((p) => ({ ...p })), source: "default" as const },
      referral: { ...DEFAULT_REFERRAL, source: "default" as const },
      community: blobCache?.community
        ? (communityFromBlob(blobCache) ?? { ...DEFAULT_COMMUNITY, source: "default" as const })
        : { ...DEFAULT_COMMUNITY, source: "default" as const },
      tokenPrices: { prices: { ...DEFAULT_TOKEN_PRICES }, source: "default" as const },
      validator: { ...DEFAULT_VALIDATOR, source: "default" as const },
      degraded: true,
    };
  }
}

export async function getTokenPricesConfig(): Promise<
  TokenPricesConfig & { source: "default" | "firestore" }
> {
  const snap = await adminDb().doc(TOKEN_PRICES_DOC).get();
  if (!snap.exists) {
    return { prices: { ...DEFAULT_TOKEN_PRICES }, source: "default" };
  }
  const d = snap.data() as Partial<TokenPricesConfig & { updatedAt?: unknown }>;
  const merged = { ...DEFAULT_TOKEN_PRICES, ...(d.prices ?? {}) };
  for (const key of Object.keys(merged)) {
    const n = Number(merged[key]);
    if (!Number.isFinite(n) || n < 0) merged[key] = DEFAULT_TOKEN_PRICES[key] ?? 0;
  }
  return {
    prices: merged,
    updatedAt: tsToIso(d.updatedAt),
    source: "firestore",
  };
}

export async function saveTokenPricesConfig(
  prices: Record<string, number>,
): Promise<TokenPricesConfig & { source: "firestore" }> {
  const sanitized: Record<string, number> = { ...DEFAULT_TOKEN_PRICES };
  for (const [key, value] of Object.entries(prices)) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) sanitized[key.toUpperCase()] = n;
  }
  await adminDb().doc(TOKEN_PRICES_DOC).set(
    { prices: sanitized, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  const result = await getTokenPricesConfig();
  return { prices: result.prices, updatedAt: result.updatedAt, source: "firestore" };
}
