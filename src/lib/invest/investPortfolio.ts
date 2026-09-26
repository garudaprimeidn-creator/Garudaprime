import { INVESTMENT_FUNDS } from "../../app/investData.js";
import { getFeeRate } from "../protocol/feeConfig.js";

export type InvestPosition = {
  id: string;
  fundId: number;
  principalUsd: number;
  startedAt: string;
  onChainPositionId?: number;
  investTxHash?: string;
};

export type StakingPosition = {
  id: string;
  productId: string;
  /** Staked amount in the product's native token (GAT or SDA). */
  stakedAmount: number;
  startedAt: string;
  onChainStakeId?: number;
  stakeTxHash?: string;
  /** On-chain tx hash when SDA was locked from wallet. */
  sdaLockTxHash?: string;
  /** @deprecated use stakedAmount */
  stakedGat?: number;
};

export type StakingProduct = {
  id: string;
  token: "GAT" | "SDA";
  nameKey: "gatFlex" | "gat90" | "sda30";
  apr: number;
  lockDays: number;
  minAmount: number;
  /** @deprecated use minAmount */
  minGat?: number;
};

export const STAKING_PRODUCTS: StakingProduct[] = [
  { id: "gat-flex", token: "GAT", nameKey: "gatFlex", apr: 6, lockDays: 0, minAmount: 100 },
  { id: "gat-90", token: "GAT", nameKey: "gat90", apr: 12, lockDays: 90, minAmount: 500 },
  { id: "sda-30", token: "SDA", nameKey: "sda30", apr: 8, lockDays: 30, minAmount: 50 },
];

const STORAGE_KEY = "garuda_invest_portfolio";

export function parseApr(apr: string | number): number {
  if (typeof apr === "number") return Number.isFinite(apr) ? apr : 0;
  return parseFloat(String(apr).replace("%", "")) || 0;
}

export function calcInvestProfit(principalUsd: number, aprPercent: number, startedAt: string): number {
  const days = Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 86400000);
  return principalUsd * (aprPercent / 100) * (days / 365);
}

export function getStakedAmount(position: StakingPosition): number {
  return position.stakedAmount ?? position.stakedGat ?? 0;
}

export function getMinStake(product: StakingProduct): number {
  return product.minAmount ?? product.minGat ?? 0;
}

export function normalizeStakingPosition(raw: StakingPosition): StakingPosition {
  return {
    ...raw,
    stakedAmount: raw.stakedAmount ?? raw.stakedGat ?? 0,
  };
}

export function calcStakingReward(stakedAmount: number, aprPercent: number, startedAt: string): number {
  const days = Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 86400000);
  return stakedAmount * (aprPercent / 100) * (days / 365);
}

/** Convert SDA-denominated staking reward to GAT payout (Option B: lock SDA, reward GAT). */
export function calcStakingRewardGatFromSda(
  stakedSda: number,
  aprPercent: number,
  startedAt: string,
  sdaPriceUsd: number,
  gatPriceUsd: number,
): number {
  const rewardSda = calcStakingReward(stakedSda, aprPercent, startedAt);
  const gatUsd = gatPriceUsd > 0 ? gatPriceUsd : 0.001;
  return (rewardSda * sdaPriceUsd) / gatUsd;
}

export function estimateSdaUnlockTotals(
  stakedSda: number,
  aprPercent: number,
  startedAt: string,
  sdaPriceUsd: number,
  gatPriceUsd: number,
  withdrawFeeRate: number,
) {
  const rewardGat = calcStakingRewardGatFromSda(stakedSda, aprPercent, startedAt, sdaPriceUsd, gatPriceUsd);
  const feeGat = rewardGat * withdrawFeeRate;
  return {
    stakedSda,
    rewardSda: calcStakingReward(stakedSda, aprPercent, startedAt),
    rewardGat,
    feeGat,
    netRewardGat: rewardGat - feeGat,
  };
}

export function isStakingUnlocked(startedAt: string, lockDays: number): boolean {
  if (lockDays === 0) return true;
  return Date.now() >= new Date(startedAt).getTime() + lockDays * 86400000;
}

export function daysUntilUnlock(startedAt: string, lockDays: number): number {
  if (lockDays === 0) return 0;
  const unlock = new Date(startedAt).getTime() + lockDays * 86400000;
  return Math.max(0, Math.ceil((unlock - Date.now()) / 86400000));
}

export function totalInvestProfit(positions: InvestPosition[]): number {
  return positions.reduce((s, p) => {
    const fund = INVESTMENT_FUNDS.find((f) => f.id === p.fundId);
    if (!fund) return s;
    return s + calcInvestProfit(p.principalUsd, parseApr(fund.apr), p.startedAt);
  }, 0);
}

export function totalStakingReward(positions: StakingPosition[], products = STAKING_PRODUCTS): number {
  return positions.reduce((s, p) => {
    const prod = products.find((x) => x.id === p.productId);
    if (!prod) return s;
    return s + calcStakingReward(getStakedAmount(p), prod.apr, p.startedAt);
  }, 0);
}

export function totalStakingRewardByToken(
  positions: StakingPosition[],
  products = STAKING_PRODUCTS,
  prices: { SDA?: number; GAT?: number } = {},
): Partial<Record<"GAT" | "SDA", number>> {
  const out: Partial<Record<"GAT" | "SDA", number>> = {};
  for (const p of positions) {
    const prod = products.find((x) => x.id === p.productId);
    if (!prod) continue;
    const staked = getStakedAmount(p);
    if (prod.token === "SDA") {
      const rewardGat = calcStakingRewardGatFromSda(
        staked,
        prod.apr,
        p.startedAt,
        prices.SDA ?? 0,
        prices.GAT ?? 0,
      );
      out.GAT = (out.GAT ?? 0) + rewardGat;
    } else {
      const reward = calcStakingReward(staked, prod.apr, p.startedAt);
      out.GAT = (out.GAT ?? 0) + reward;
    }
  }
  return out;
}

export type PortfolioState = {
  investments: InvestPosition[];
  staking: StakingPosition[];
};

function defaultPortfolio(): PortfolioState {
  return { investments: [], staking: [] };
}

export function loadPortfolio(): PortfolioState {
  if (typeof window === "undefined") return defaultPortfolio();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PortfolioState;
      return {
        investments: parsed.investments ?? [],
        staking: (parsed.staking ?? []).map(normalizeStakingPosition),
      };
    }
  } catch {
    /* ignore */
  }
  return defaultPortfolio();
}

export function savePortfolio(state: PortfolioState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function newPortfolioId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Ledger/API invest position (pre on-chain migration). */
export function isLegacyLedgerInvestPosition(position: InvestPosition): boolean {
  return position.onChainPositionId == null;
}

/** Ledger/API GAT stake (pre on-chain migration). */
export function isLegacyLedgerGatStake(
  position: StakingPosition,
  products: StakingProduct[] = STAKING_PRODUCTS,
): boolean {
  const product = products.find((p) => p.id === position.productId);
  return product?.token === "GAT" && position.onChainStakeId == null;
}

export function countLegacyGatPositions(
  investments: InvestPosition[],
  staking: StakingPosition[],
  products: StakingProduct[] = STAKING_PRODUCTS,
): { invest: number; stake: number; total: number } {
  const invest = investments.filter(isLegacyLedgerInvestPosition).length;
  const stake = staking.filter((p) => isLegacyLedgerGatStake(p, products)).length;
  return { invest, stake, total: invest + stake };
}

export function investedFundsFromPositions(positions: InvestPosition[]): Record<number, number> {
  const map: Record<number, number> = {};
  for (const p of positions) {
    map[p.fundId] = (map[p.fundId] || 0) + p.principalUsd;
  }
  return map;
}

export function redeemInvestTotals(position: InvestPosition) {
  const fund = INVESTMENT_FUNDS.find((f) => f.id === position.fundId);
  const apr = fund ? parseApr(fund.apr) : 0;
  const profit = calcInvestProfit(position.principalUsd, apr, position.startedAt);
  const grossUsd = position.principalUsd + profit;
  const fee = grossUsd * getFeeRate("withdraw");
  return { profit, grossUsd, fee, netUsd: grossUsd - fee };
}

export function unstakeTotals(position: StakingPosition, products = STAKING_PRODUCTS) {
  const prod = products.find((p) => p.id === position.productId);
  const staked = getStakedAmount(position);
  const reward = prod ? calcStakingReward(staked, prod.apr, position.startedAt) : 0;
  const gross = staked + reward;
  const fee = gross * getFeeRate("withdraw");
  return { reward, totalGat: gross, fee, netGat: gross - fee, token: prod?.token ?? "GAT" as const };
}

/** SDA lock: principal returned in SDA, imbal hasil paid in GAT from treasury. */
export function unstakeSdaTotals(
  position: StakingPosition,
  products = STAKING_PRODUCTS,
  prices: { SDA?: number; GAT?: number } = {},
) {
  const prod = products.find((p) => p.id === position.productId);
  const stakedSda = getStakedAmount(position);
  const sdaPrice = prices.SDA ?? 0;
  const gatPrice = prices.GAT ?? 0;
  const apr = prod?.apr ?? 0;
  const est = estimateSdaUnlockTotals(
    stakedSda,
    apr,
    position.startedAt,
    sdaPrice,
    gatPrice,
    getFeeRate("withdraw"),
  );
  return {
    ...est,
    token: "SDA" as const,
    rewardToken: "GAT" as const,
  };
}
