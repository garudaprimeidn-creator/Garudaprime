/** Protocol fee types, mirrors GATFeeRouter.sol FeeType enum */
export const FEE_TYPES = [
  "transaction",
  "market",
  "investment",
  "withdraw",
  "deposit",
  "swap",
  "trading",
  "staking",
  "treasury",
  "validator",
  "referral",
  "burn",
  "liquidity",
  "autoDistribution",
] as const;

export type FeeType = (typeof FEE_TYPES)[number];

export type FeeRatesBps = Record<FeeType, number>;

export type DistributionBps = {
  main: number;
  validator: number;
  referral: number;
  burn: number;
  liquidity: number;
  insurance: number;
  autoDistribution: number;
};

/** Default rates in basis points (10000 = 100%), synced with GATFeeRouter.sol */
export const DEFAULT_FEE_RATES_BPS: FeeRatesBps = {
  transaction: 10,
  market: 25,
  investment: 50,
  withdraw: 30,
  deposit: 0,
  swap: 10,
  trading: 20,
  staking: 15,
  treasury: 0,
  validator: 0,
  referral: 0,
  burn: 0,
  liquidity: 0,
  autoDistribution: 0,
};

export const DEFAULT_DISTRIBUTION_BPS: DistributionBps = {
  main: 3000,
  validator: 1500,
  referral: 1000,
  burn: 500,
  liquidity: 1500,
  insurance: 1000,
  autoDistribution: 1500,
};

export const BPS_DENOM = 10_000;

export function bpsToRate(bps: number): number {
  return bps / BPS_DENOM;
}

export function computeFeeAmount(grossAmount: number, bps: number): number {
  if (!grossAmount || !bps) return 0;
  return (grossAmount * bps) / BPS_DENOM;
}

export function computeNetAmount(grossAmount: number, bps: number): number {
  return grossAmount - computeFeeAmount(grossAmount, bps);
}

/** Sender pays fee on top, recipient receives the full entered amount. */
export function computeSenderPaysAmounts(recipientAmount: number, bps: number) {
  const feeAmount = computeFeeAmount(recipientAmount, bps);
  return {
    recipientAmount,
    feeAmount,
    totalDebit: recipientAmount + feeAmount,
    feeBps: bps,
  };
}

export function feeLabel(type: FeeType): string {
  const labels: Record<FeeType, string> = {
    transaction: "Transaction Fee",
    market: "Market Fee",
    investment: "Investment Fee",
    withdraw: "Withdraw Fee",
    deposit: "Deposit Fee",
    swap: "Swap Fee",
    trading: "Trading Fee",
    staking: "Staking Fee",
    treasury: "Treasury Fee",
    validator: "Validator Fee",
    referral: "Referral Fee",
    burn: "Burn Fee",
    liquidity: "Liquidity Fee",
    autoDistribution: "Auto Distribution Fee",
  };
  return labels[type];
}

export const TREASURY_BUCKETS = [
  "main",
  "validator",
  "referral",
  "burn",
  "liquidity",
  "insurance",
  "autoDistribution",
] as const;

export type TreasuryBucket = (typeof TREASURY_BUCKETS)[number];
