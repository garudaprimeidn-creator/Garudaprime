import type { ReferralProgramConfig, ReferralTier } from "../platform/platformProgramsService";

export type ReferralTierRow = {
  label: string;
  reward: string;
  isBonus: boolean;
};

export function referralBaseTierLabel(config: ReferralProgramConfig): string {
  const baseTier = config.tiers.find((t) => t.minReferrals <= 1);
  return baseTier?.label ?? "1 referral sukses";
}

export function referralBonusTiers(config: ReferralProgramConfig): ReferralTier[] {
  return config.tiers
    .filter((t) => t.minReferrals > 1)
    .sort((a, b) => a.minReferrals - b.minReferrals);
}

/** Rows for tier reward table, base reward + milestone bonuses only. */
export function buildReferralTierRows(config: ReferralProgramConfig): ReferralTierRow[] {
  const rows: ReferralTierRow[] = [
    {
      label: referralBaseTierLabel(config),
      reward: `${config.baseRewardGat} GAT`,
      isBonus: false,
    },
  ];
  for (const tier of referralBonusTiers(config)) {
    rows.push({
      label: tier.label,
      reward: `+${tier.bonusGat} GAT`,
      isBonus: true,
    });
  }
  return rows;
}

export function maxReferralBonusGat(config: ReferralProgramConfig): number {
  return referralBonusTiers(config).reduce((max, t) => Math.max(max, t.bonusGat), 0);
}

export function totalReferralPotentialGat(config: ReferralProgramConfig): number {
  const bonuses = referralBonusTiers(config).reduce((sum, t) => sum + t.bonusGat, 0);
  return config.baseRewardGat + bonuses;
}
