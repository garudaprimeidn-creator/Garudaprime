import { STAKING_PRODUCTS, type StakingProduct } from "../invest/investPortfolio";
import { isPayHubApiConfigured } from "../payhub/payHubApi";
import { setTokenPricesUsd } from "../../app/tokenEconomy";
import { REFERRAL_REWARD_POLICY } from "../referral/referralRewardPolicy";

export type ReferralTier = {
  minReferrals: number;
  bonusGat: number;
  label: string;
};

export type ReferralProgramConfig = {
  enabled: boolean;
  autoReward?: boolean;
  baseRewardGat: number;
  requireKycTier: number;
  tiers: ReferralTier[];
};

export type CommunityProgramConfig = {
  zakat: { enabled: boolean; nisabRateBps: number; protocolFeeBps: number };
  charity: { enabled: boolean; presetAmountsGat: number[]; protocolFeeBps: number };
  overview: { members: string; volume: string; countries: string };
};

export type ValidatorProgramConfig = {
  enabled: boolean;
  joinRewardGat: number;
  monthlyRewardGat: number;
  minStakeSda: number;
  requireKycTier: number;
};

export type PlatformProgramsBundle = {
  staking: { products: StakingProduct[]; source?: string };
  referral: ReferralProgramConfig & { source?: string };
  community: CommunityProgramConfig & { source?: string };
  validator?: ValidatorProgramConfig & { source?: string };
  tokenPrices?: { prices: Record<string, number>; source?: string };
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

const DEFAULT_VALIDATOR: ValidatorProgramConfig = {
  enabled: true,
  joinRewardGat: 500,
  monthlyRewardGat: 100,
  minStakeSda: 10000,
  requireKycTier: 2,
};

function apiBase(): string | null {
  return import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "") || null;
}

const PLACEHOLDER = new Set([", ", "-", "-", ""]);

function mergeOverview(
  base: CommunityProgramConfig["overview"],
  patch?: Partial<CommunityProgramConfig["overview"]>,
): CommunityProgramConfig["overview"] {
  const out = { ...base };
  if (!patch) return out;
  for (const key of ["members", "volume", "countries"] as const) {
    const v = patch[key]?.trim();
    if (v && !PLACEHOLDER.has(v)) out[key] = v;
  }
  return out;
}

async function fetchCommunityFromStorage(): Promise<Partial<CommunityProgramConfig> | null> {
  try {
    const res = await fetch("/community-program.json", { cache: "no-store" });
    if (res.ok) return (await res.json()) as Partial<CommunityProgramConfig>;
  } catch {
    /* static fallback unavailable */
  }

  const bucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined;
  if (!bucket) return null;
  const url = `https://storage.googleapis.com/${bucket}/platform/community-program.json`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Partial<CommunityProgramConfig>;
  } catch {
    return null;
  }
}

export function defaultPlatformPrograms(): PlatformProgramsBundle {
  return {
    staking: { products: STAKING_PRODUCTS.map((p) => ({ ...p })) },
    referral: DEFAULT_REFERRAL,
    community: DEFAULT_COMMUNITY,
    validator: DEFAULT_VALIDATOR,
  };
}

export async function fetchPlatformPrograms(): Promise<PlatformProgramsBundle> {
  const base = apiBase();
  const defaults = defaultPlatformPrograms();
  const storageCommunity = await fetchCommunityFromStorage();

  let bundle = defaults;
  if (base) {
    try {
      const res = await fetch(`${base}/platform/programs`, { method: "GET", cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as PlatformProgramsBundle & { degraded?: boolean };
        if (data.tokenPrices?.prices) {
          setTokenPricesUsd(data.tokenPrices.prices);
        }
        bundle = {
          staking: {
            products: data.staking?.products?.length ? data.staking.products : defaults.staking.products,
            source: data.staking?.source,
          },
          referral: { ...defaults.referral, ...data.referral },
          community: {
            zakat: { ...defaults.community.zakat, ...data.community?.zakat },
            charity: { ...defaults.community.charity, ...data.community?.charity },
            overview: mergeOverview(defaults.community.overview, data.community?.overview),
          },
          validator: { ...defaults.validator!, ...data.validator },
        };
      }
    } catch {
      /* use defaults below */
    }
  }

  if (storageCommunity) {
    bundle = {
      ...bundle,
      community: {
        zakat: { ...bundle.community.zakat, ...storageCommunity.zakat },
        charity: { ...bundle.community.charity, ...storageCommunity.charity },
        overview: mergeOverview(bundle.community.overview, storageCommunity.overview),
        source: bundle.community.source ?? "storage",
      },
    };
  }

  return bundle;
}

export function isPlatformApiConfigured(): boolean {
  return isPayHubApiConfigured();
}
