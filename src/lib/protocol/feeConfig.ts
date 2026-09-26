import {
  DEFAULT_DISTRIBUTION_BPS,
  DEFAULT_FEE_RATES_BPS,
  type DistributionBps,
  type FeeRatesBps,
  type FeeType,
  bpsToRate,
} from "./feeTypes.js";

export type ProtocolFeeConfig = {
  ratesBps: FeeRatesBps;
  distributionBps: DistributionBps;
  updatedAt?: string;
  source: "default" | "firestore" | "chain";
};

let cached: ProtocolFeeConfig | null = null;

export function getDefaultFeeConfig(): ProtocolFeeConfig {
  return {
    ratesBps: { ...DEFAULT_FEE_RATES_BPS },
    distributionBps: { ...DEFAULT_DISTRIBUTION_BPS },
    source: "default",
  };
}

export function getCachedFeeConfig(): ProtocolFeeConfig {
  return cached ?? getDefaultFeeConfig();
}

export function setCachedFeeConfig(config: ProtocolFeeConfig) {
  cached = config;
}

export function getFeeRate(type: FeeType, config = getCachedFeeConfig()): number {
  return bpsToRate(config.ratesBps[type] ?? 0);
}

export function getFeeBps(type: FeeType, config = getCachedFeeConfig()): number {
  return config.ratesBps[type] ?? 0;
}

export async function loadFeeConfigFromApi(): Promise<ProtocolFeeConfig> {
  const base = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");
  if (!base) {
    const def = getDefaultFeeConfig();
    setCachedFeeConfig(def);
    return def;
  }
  try {
    const res = await fetch(`${base}/protocol/fees`);
    if (!res.ok) throw new Error("fee config fetch failed");
    const data = await res.json();
    const config: ProtocolFeeConfig = {
      ratesBps: { ...DEFAULT_FEE_RATES_BPS, ...data.ratesBps },
      distributionBps: { ...DEFAULT_DISTRIBUTION_BPS, ...data.distributionBps },
      updatedAt: data.updatedAt,
      source: data.source ?? "firestore",
    };
    setCachedFeeConfig(config);
    return config;
  } catch {
    const def = getDefaultFeeConfig();
    setCachedFeeConfig(def);
    return def;
  }
}

/** Legacy rate aliases for wallet UI */
export const SWAP_FEE_RATE = () => getFeeRate("swap");
export const TRANSACTION_FEE_RATE = () => getFeeRate("transaction");
export const MARKET_FEE_RATE = () => getFeeRate("market");
export const OFFCHAIN_FEE_RATE = () => getFeeRate("transaction");
