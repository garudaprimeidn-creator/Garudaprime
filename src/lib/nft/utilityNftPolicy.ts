import type { UtilityNftCategory, UtilityNftGroup, UtilityNftItem } from "./utilityNftTypes.js";
import { SOULBOUND_CATEGORIES } from "./utilityNftTypes.js";

export type UtilityNftLocale = "id" | "en";

type CatalogEntry = {
  category: UtilityNftCategory;
  group: UtilityNftGroup;
  title: Record<UtilityNftLocale, string>;
  utility: Record<UtilityNftLocale, string>;
};

const CATALOG: CatalogEntry[] = [
  {
    category: "membership_silver",
    group: "membership",
    title: { id: "Membership Silver", en: "Membership Silver" },
    utility: {
      id: "Akses komunitas Garuda Prime & fitur dompet dasar.",
      en: "Garuda Prime community access & core wallet features.",
    },
  },
  {
    category: "membership_gold",
    group: "membership",
    title: { id: "Membership Gold", en: "Membership Gold" },
    utility: {
      id: "Prioritas Pay Hub, merchant QR, dan invest syariah tier 2.",
      en: "Pay Hub priority, merchant QR, and Syariah invest tier 2.",
    },
  },
  {
    category: "membership_platinum",
    group: "membership",
    title: { id: "Membership Platinum", en: "Membership Platinum" },
    utility: {
      id: "Akses penuh invest, staking, governance, & fee preferensial.",
      en: "Full invest, staking, governance access & preferential fees.",
    },
  },
  {
    category: "membership_elite",
    group: "membership",
    title: { id: "Membership Elite", en: "Membership Elite" },
    utility: {
      id: "Status elite · validator/referral tier tinggi & akses ekosistem premium.",
      en: "Elite status · top validator/referral tier & premium ecosystem access.",
    },
  },
  {
    category: "kyc_identity",
    group: "identity",
    title: { id: "KYC Identity NFT", en: "KYC Identity NFT" },
    utility: {
      id: "Bukti verifikasi identitas Syariah Tier 3 on-chain (soulbound).",
      en: "On-chain Syariah Tier 3 identity verification credential (soulbound).",
    },
  },
  {
    category: "investment",
    group: "investment",
    title: { id: "Investment Certificate NFT", en: "Investment Certificate NFT" },
    utility: {
      id: "Sertifikat kepemilikan investasi halal · auditable di Sidra.",
      en: "Halal investment ownership certificate · auditable on Sidra.",
    },
  },
  {
    category: "staking",
    group: "staking",
    title: { id: "Staking Participation NFT", en: "Staking Participation NFT" },
    utility: {
      id: "Bukti partisipasi staking GAT/SDA & imbal hasil ekosistem.",
      en: "Proof of GAT/SDA staking & ecosystem profit-sharing participation.",
    },
  },
  {
    category: "achievement",
    group: "achievement",
    title: { id: "Community Achievement NFT", en: "Community Achievement NFT" },
    utility: {
      id: "Penghargaan komunitas · referral, zakat, atau aktivitas aktif.",
      en: "Community award · referral, zakat, or active engagement.",
    },
  },
  {
    category: "validator",
    group: "validator",
    title: { id: "Validator NFT", en: "Validator NFT" },
    utility: {
      id: "Validator resmi jaringan Garuda Prime / Sidra ecosystem.",
      en: "Official Garuda Prime / Sidra ecosystem validator credential.",
    },
  },
];

export type UserNftEligibilityInput = {
  locale?: UtilityNftLocale;
  walletAddress?: string | null;
  kycTier?: number;
  kycStatus?: string | null;
  hasWallet?: boolean;
  investCount?: number;
  stakingCount?: number;
  referralCompleted?: number;
  validatorActive?: boolean;
  zakatPaid?: boolean;
};

export function buildUtilityNftCatalog(locale: UtilityNftLocale = "id"): CatalogEntry[] {
  return CATALOG;
}

export function evaluateMembershipTier(input: UserNftEligibilityInput): UtilityNftCategory | null {
  if (input.validatorActive) return "membership_elite";
  const tier = Number(input.kycTier ?? 0);
  if (tier >= 3) return "membership_platinum";
  if (tier >= 2) return "membership_gold";
  if (input.hasWallet || tier >= 1) return "membership_silver";
  return null;
}

export function isCategoryEligible(
  category: UtilityNftCategory,
  input: UserNftEligibilityInput,
): boolean {
  switch (category) {
    case "membership_silver":
      return Boolean(input.hasWallet);
    case "membership_gold":
      return Number(input.kycTier ?? 0) >= 2;
    case "membership_platinum":
      return Number(input.kycTier ?? 0) >= 3
        && String(input.kycStatus ?? "").toLowerCase().match(/verified|approved/) != null;
    case "membership_elite":
      return Boolean(input.validatorActive)
        || Number(input.referralCompleted ?? 0) >= 10;
    case "kyc_identity":
      return Number(input.kycTier ?? 0) >= 3
        && String(input.kycStatus ?? "").toLowerCase().match(/verified|approved/) != null;
    case "investment":
      return Number(input.investCount ?? 0) > 0;
    case "staking":
      return Number(input.stakingCount ?? 0) > 0;
    case "achievement":
      return Number(input.referralCompleted ?? 0) >= 1
        || Boolean(input.zakatPaid)
        || Number(input.investCount ?? 0) > 0;
    case "validator":
      return Boolean(input.validatorActive);
    default:
      return false;
  }
}

export function buildEligibleUtilityNftItems(
  input: UserNftEligibilityInput,
): UtilityNftItem[] {
  const locale = input.locale ?? "id";
  const items: UtilityNftItem[] = [];

  for (const entry of CATALOG) {
    const eligible = isCategoryEligible(entry.category, input);
    items.push({
      id: entry.category,
      category: entry.category,
      group: entry.group,
      title: entry.title[locale],
      utility: entry.utility[locale],
      status: eligible ? "eligible" : "locked",
      issuedAt: null,
      tokenId: null,
      txHash: null,
      contractAddress: null,
      walletAddress: input.walletAddress ?? null,
      onChainVerified: false,
      soulbound: SOULBOUND_CATEGORIES.has(entry.category),
      metadata: {},
    });
  }

  return items;
}

export function buildUtilityNftTokenUri(input: {
  category: UtilityNftCategory;
  title: string;
  utility: string;
  issuedAt: string;
  walletAddress: string;
  uid: string;
  extra?: Record<string, string | number | boolean | null>;
}): string {
  const payload = {
    name: input.title,
    description: input.utility,
    image: "https://app.garudaprime.id/icon-512.png",
    external_url: "https://app.garudaprime.id",
    attributes: [
      { trait_type: "category", value: input.category },
      { trait_type: "issued_at", value: input.issuedAt },
      { trait_type: "wallet", value: input.walletAddress },
      { trait_type: "platform", value: "Garuda Prime" },
      { trait_type: "network", value: "Sidra" },
      ...(input.extra
        ? Object.entries(input.extra).map(([k, v]) => ({ trait_type: k, value: String(v ?? "") }))
        : []),
    ],
  };
  const json = JSON.stringify(payload);
  return `data:application/json;base64,${Buffer.from(json, "utf8").toString("base64")}`;
}
