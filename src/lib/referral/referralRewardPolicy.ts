import type { ReferralProgramConfig, ReferralTier } from "../platform/platformProgramsService.js";

/** GATProtocolTreasury.sol, must match on-chain BUCKET_REFERRAL. */
export const REFERRAL_TREASURY_BUCKET = 2;

/** Canonical program defaults, sync with Firestore `platform_config/referral_program`. */
export const REFERRAL_REWARD_POLICY = {
  baseRewardGat: 25,
  requireKycTier: 3,
  autoReward: true,
  singleSponsorAtRegistration: true,
  tiers: [
    { minReferrals: 1, bonusGat: 25, label: "1 referral sukses" },
    { minReferrals: 5, bonusGat: 50, label: "5 referral (bonus)" },
    { minReferrals: 10, bonusGat: 150, label: "10 referral (bonus)" },
  ] satisfies ReferralTier[],
} as const;

export type ReferralPayoutKind = "base" | "tier_bonus";

export type ReferralDistributionMode = "locked" | "pay_hub" | "sidra_treasury";

export function referralBonusTiers(config: Pick<ReferralProgramConfig, "tiers">): ReferralTier[] {
  return [...config.tiers]
    .filter((t) => t.minReferrals > 1)
    .sort((a, b) => a.minReferrals - b.minReferrals);
}

export function validateReferralProgramConfig(
  config: ReferralProgramConfig,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (config.baseRewardGat <= 0) errors.push("baseRewardGat must be > 0");
  if (config.requireKycTier < 1 || config.requireKycTier > 3) {
    errors.push("requireKycTier must be 1-3");
  }
  for (const tier of config.tiers) {
    if (tier.minReferrals < 1) errors.push(`Invalid minReferrals for ${tier.label}`);
    if (tier.bonusGat < 0) errors.push(`Invalid bonusGat for ${tier.label}`);
  }
  const bonusMins = referralBonusTiers(config).map((t) => t.minReferrals);
  if (new Set(bonusMins).size !== bonusMins.length) {
    errors.push("Duplicate milestone minReferrals in tiers");
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

export function expectedTierBonus(config: ReferralProgramConfig, minReferrals: number): number | null {
  const tier = referralBonusTiers(config).find((t) => t.minReferrals === minReferrals);
  return tier?.bonusGat ?? null;
}
