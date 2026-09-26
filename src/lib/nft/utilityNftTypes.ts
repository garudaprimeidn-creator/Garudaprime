/** Utility NFT categories, sync with GarudaUtilityNFT.sol category ids. */
export const UTILITY_NFT_CATEGORIES = [
  "membership_silver",
  "membership_gold",
  "membership_platinum",
  "membership_elite",
  "kyc_identity",
  "investment",
  "staking",
  "achievement",
  "validator",
] as const;

export type UtilityNftCategory = (typeof UTILITY_NFT_CATEGORIES)[number];

export type UtilityNftGroup =
  | "membership"
  | "identity"
  | "investment"
  | "staking"
  | "achievement"
  | "validator";

export type UtilityNftStatus = "owned" | "eligible" | "locked" | "pending_mint";

export type UtilityNftItem = {
  id: string;
  category: UtilityNftCategory;
  group: UtilityNftGroup;
  title: string;
  utility: string;
  status: UtilityNftStatus;
  issuedAt: string | null;
  tokenId: string | null;
  txHash: string | null;
  contractAddress: string | null;
  walletAddress: string | null;
  onChainVerified: boolean;
  soulbound: boolean;
  metadata: Record<string, string | number | boolean | null>;
};

export type UtilityNftPortfolio = {
  total: number;
  owned: number;
  eligible: number;
  pendingMint: number;
  onChainConfigured: boolean;
  contractAddress: string | null;
  network: string;
  chainId: number;
  items: UtilityNftItem[];
};

/** Maps category → on-chain category id (GarudaUtilityNFT.sol). */
export const UTILITY_NFT_CATEGORY_ID: Record<UtilityNftCategory, number> = {
  membership_silver: 1,
  membership_gold: 2,
  membership_platinum: 3,
  membership_elite: 4,
  kyc_identity: 10,
  investment: 20,
  staking: 30,
  achievement: 40,
  validator: 50,
};

export const SOULBOUND_CATEGORIES = new Set<UtilityNftCategory>([
  "membership_silver",
  "membership_gold",
  "membership_platinum",
  "membership_elite",
  "kyc_identity",
  "investment",
  "staking",
  "achievement",
  "validator",
]);
