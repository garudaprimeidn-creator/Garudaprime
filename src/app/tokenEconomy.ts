import { resolveDisplayLogo } from "./tokenAssets";

const GAT_CONTRACT = import.meta.env.VITE_GAT_TOKEN_ADDRESS?.trim()?.toLowerCase() ?? null;
const USDX_CONTRACT = import.meta.env.VITE_USDX_TOKEN_ADDRESS?.trim()?.toLowerCase() ?? null;

const BASE_CONTRACT_BY_SYMBOL: Record<string, string | null> = {
  GAT: GAT_CONTRACT,
  SDA: null,
  ETH: null,
  USDT: null,
  USDX: USDX_CONTRACT,
};

/** Default wallet / home asset list order */
export const CORE_WALLET_SYMBOLS = ["GAT", "SDA", "ETH", "USDT", "USDX"] as const;

export const GAT_TOKEN_ECONOMY = {
  totalSupply: 100_000_000,
  maxSupply: 100_000_000,
  decimals: 18,
} as const;

/** Demo holdings aligned with portfolio allocation */

export const MAIN_NETWORK = {
  symbol: "SDA",
  name: "Sidra Network",
} as const;

export const displayTokenSymbol = (symbol: string): string => {
  const key = symbol.toUpperCase();
  if (key === "SDA") return "SIDRA";
  return key;
};

function envPrice(key: string, fallback: number, allowZero = false): number {
  const raw = import.meta.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (allowZero && n === 0) return 0;
  return n > 0 ? n : fallback;
}

/** USD price per 1 unit, override via VITE_*_PRICE_USD or admin Firestore */
const DEFAULT_TOKEN_PRICES_USD: Record<string, number> = {
  GAT: envPrice("VITE_GAT_PRICE_USD", 0, true),
  SDA: envPrice("VITE_SDA_PRICE_USD", 0, true),
  USDT: envPrice("VITE_USDT_PRICE_USD", 1),
  USDX: envPrice("VITE_USDX_PRICE_USD", 1),
  ETH: envPrice("VITE_ETH_PRICE_USD", 3850),
};

let runtimeTokenPricesUsd: Partial<Record<string, number>> = {};

export const TOKEN_PRICES_USD: Record<string, number> = { ...DEFAULT_TOKEN_PRICES_USD };

export function setTokenPricesUsd(prices: Partial<Record<string, number>>) {
  runtimeTokenPricesUsd = { ...prices };
  for (const [symbol, value] of Object.entries(prices)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      TOKEN_PRICES_USD[symbol.toUpperCase()] = value;
    }
  }
}

export async function loadTokenPricesFromApi(): Promise<Record<string, number>> {
  const base = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");
  if (!base) {
    setTokenPricesUsd(DEFAULT_TOKEN_PRICES_USD);
    return { ...TOKEN_PRICES_USD };
  }
  try {
    const res = await fetch(`${base}/platform/programs`);
    if (!res.ok) throw new Error("token prices fetch failed");
    const data = (await res.json()) as { tokenPrices?: { prices?: Record<string, number> } };
    const prices = data.tokenPrices?.prices;
    if (prices && Object.keys(prices).length) {
      setTokenPricesUsd(prices);
    }
  } catch {
    setTokenPricesUsd(DEFAULT_TOKEN_PRICES_USD);
  }
  return { ...TOKEN_PRICES_USD };
}

/** Official estimated conversion pairs (fallback when USD price unavailable) */
export const TOKEN_CONVERSIONS = {
  GAT_SDA: 0,
  SDA_GAT: 0,
  ETH_GAT: 0,
  ETH_SDA: 0,
} as const;

const CONVERSION_KEY: Record<string, Record<string, number>> = {
  GAT: { SDA: TOKEN_CONVERSIONS.GAT_SDA },
  SDA: { GAT: TOKEN_CONVERSIONS.SDA_GAT },
  ETH: { GAT: TOKEN_CONVERSIONS.ETH_GAT, SDA: TOKEN_CONVERSIONS.ETH_SDA },
};

/** Market USD price for GAT (0 when not listed). */
export const getGatMarketPriceUsd = (): number => {
  const key = "GAT";
  const runtime = runtimeTokenPricesUsd[key];
  if (typeof runtime === "number" && Number.isFinite(runtime) && runtime > 0) return runtime;
  const env = TOKEN_PRICES_USD[key] ?? DEFAULT_TOKEN_PRICES_USD[key] ?? 0;
  return env > 0 ? env : 0;
};

export const getTokenPriceUsd = (symbol: string): number => {
  const key = symbol.toUpperCase();
  const runtime = runtimeTokenPricesUsd[key];
  if (typeof runtime === "number" && Number.isFinite(runtime) && runtime >= 0) return runtime;
  return TOKEN_PRICES_USD[key] ?? DEFAULT_TOKEN_PRICES_USD[key] ?? 0;
};

export const tokenToUsd = (amount: number, symbol: string): number =>
  amount * getTokenPriceUsd(symbol);

export const usdToToken = (usd: number, symbol: string): number => {
  const price = getTokenPriceUsd(symbol);
  return price > 0 ? usd / price : 0;
};

/** Swap rate: how many `to` tokens per 1 `from` token */
export const getSwapRate = (from: string, to: string): number => {
  if (from === to) return 1;
  const fromPrice = getTokenPriceUsd(from);
  const toPrice = getTokenPriceUsd(to);
  if (fromPrice > 0 && toPrice > 0) return fromPrice / toPrice;
  if (fromPrice === 0 || toPrice === 0) return 0;
  const fixed = CONVERSION_KEY[from]?.[to];
  if (fixed !== undefined) return fixed;
  return 0;
};

export const convertToken = (amount: number, from: string, to: string): number => {
  const n = parseFloat(String(amount));
  if (!n || n <= 0) return 0;
  return n * getSwapRate(from, to);
};

export const formatRate = (rate: number, maxDecimals = 2): string => {
  if (rate >= 100) return rate.toFixed(1);
  if (rate >= 1) return rate.toFixed(2);
  return rate.toFixed(3);
};

export const GAT_NOT_LISTED_LABEL = "Not Listed Yet";

export const isTokenPriceListed = (symbol: string): boolean =>
  getTokenPriceUsd(symbol) > 0;

export const formatTokenPriceUsd = (symbol: string): string => {
  const key = symbol.toUpperCase();
  const price = getTokenPriceUsd(key);
  if (key === "GAT" && price === 0) return GAT_NOT_LISTED_LABEL;
  if (!Number.isFinite(price) || price < 0) return ", ";
  if (price === 0) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: price >= 100 ? 0 : 2,
    maximumFractionDigits: price >= 100 ? 0 : 2,
  }).format(price);
};

export const formatConversionLabel = (from: string, to: string): string => {
  const fromKey = from.toUpperCase();
  const toKey = to.toUpperCase();
  if ((fromKey === "GAT" || toKey === "GAT") && getTokenPriceUsd("GAT") === 0) {
    return `1 ${fromKey} = ${GAT_NOT_LISTED_LABEL}`;
  }
  const rate = getSwapRate(fromKey, toKey);
  if (!rate) return `1 ${fromKey} = , `;
  return `1 ${fromKey} ≈ ${formatRate(rate)} ${toKey}`;
};

export {
  SWAP_FEE_RATE,
  TRANSACTION_FEE_RATE,
  MARKET_FEE_RATE,
  OFFCHAIN_FEE_RATE,
  getFeeRate,
  getFeeBps,
  loadFeeConfigFromApi,
} from "../lib/protocol/feeConfig";

/** Empty wallet, new users start with zero balances until on-chain sync. */
export const EMPTY_HOLDINGS: Record<string, number> = {
  GAT: 0,
  SDA: 0,
  ETH: 0,
  USDT: 0,
  USDX: 0,
};

/** @deprecated Demo balances removed for production; use EMPTY_HOLDINGS or on-chain data. */
export const DEMO_HOLDINGS: Record<string, number> = EMPTY_HOLDINGS;

export const portfolioTotalUsd = (
  holdings: Record<string, number> = DEMO_HOLDINGS,
): number =>
  Object.entries(holdings).reduce(
    (sum, [symbol, bal]) => sum + tokenToUsd(bal, symbol),
    0,
  );

export type TokenRow = {
  symbol: string;
  name: string;
  balance: number;
  usd: number;
  change: number;
  color: string;
  dot: string;
  custom?: boolean;
  contractAddress?: string;
  logoUrl?: string | null;
};

const TOKEN_META: Record<string, Omit<TokenRow, "balance" | "usd">> = {
  GAT: { symbol: "GAT", name: "Garuda Asset Token", change: 5.24, color: "#2563eb", dot: "bg-blue-500" },
  SDA: { symbol: "SDA", name: "Sidra Network", change: 2.87, color: "#6366f1", dot: "bg-indigo-400" },
  ETH: { symbol: "ETH", name: "Ethereum", change: -1.23, color: "#627eea", dot: "bg-blue-400" },
  USDT: { symbol: "USDT", name: "Tether USD", change: 0.01, color: "#26a17b", dot: "bg-teal-400" },
  USDX: { symbol: "USDX", name: "Garuda USD", change: 0.0, color: "#0dca82", dot: "bg-emerald-400" },
};

export const buildTokenRows = (
  holdings: Record<string, number> = DEMO_HOLDINGS,
  customTokens: { symbol: string; name: string; balance: number; color: string; address: string; logoUrl?: string | null }[] = [],
): TokenRow[] => {
  const customByAddress = new Map(
    customTokens.map((t) => [t.address.toLowerCase(), t]),
  );

  const base = CORE_WALLET_SYMBOLS.map((symbol) => {
    const knownAddress = BASE_CONTRACT_BY_SYMBOL[symbol];
    const imported = knownAddress ? customByAddress.get(knownAddress) : undefined;
    const balance = imported?.balance ?? holdings[symbol] ?? DEMO_HOLDINGS[symbol] ?? 0;
    const contractAddress = knownAddress ?? imported?.address;
    const logoUrl = resolveDisplayLogo(symbol, contractAddress, imported?.logoUrl);

    return {
      ...TOKEN_META[symbol],
      balance,
      usd: tokenToUsd(balance, symbol),
      contractAddress: contractAddress ?? undefined,
      logoUrl,
      custom: !!imported,
    };
  });

  const mergedAddresses = new Set(
    base.map((t) => t.contractAddress?.toLowerCase()).filter(Boolean) as string[],
  );

  const custom = customTokens
    .filter((t) => !mergedAddresses.has(t.address.toLowerCase()))
    .map((t) => ({
      symbol: t.symbol,
      name: t.name,
      balance: t.balance,
      usd: tokenToUsd(t.balance, t.symbol),
      change: 0,
      color: t.color,
      dot: "bg-zinc-400",
      custom: true as const,
      contractAddress: t.address,
      logoUrl: resolveDisplayLogo(t.symbol, t.address, t.logoUrl),
    }));

  return [...base, ...custom];
};

const roundTokenBalance = (value: number): number =>
  Math.round(value * 1_000_000) / 1_000_000;

export const mergeOnChainHoldings = (
  base: Record<string, number>,
  onChain: { gat: number | null; sda: number | null; usdx?: number | null },
  options?: { clampGatIncrease?: boolean; clampSdaIncrease?: boolean },
): Record<string, number> => {
  let gat = onChain.gat;
  let sda = onChain.sda;
  const minDelta = 0.000_001;

  if (options?.clampGatIncrease && gat !== null) {
    const prev = base.GAT ?? 0;
    if (gat > prev + minDelta) gat = prev;
  }
  if (options?.clampSdaIncrease && sda !== null) {
    const prev = base.SDA ?? 0;
    if (sda > prev + minDelta) sda = prev;
  }

  return {
    ...base,
    ...(gat !== null ? { GAT: roundTokenBalance(gat) } : {}),
    ...(sda !== null ? { SDA: roundTokenBalance(sda) } : {}),
    ...(onChain.usdx !== null && onChain.usdx !== undefined
      ? { USDX: roundTokenBalance(onChain.usdx) }
      : {}),
  };
};
