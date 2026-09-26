import { tokenToUsd, CORE_WALLET_SYMBOLS } from "../../app/tokenEconomy";

const CHART_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"] as const;

const ALLOCATION_COLORS: Record<string, string> = {
  GAT: "#2563eb",
  SDA: "#6366f1",
  ETH: "#627eea",
  USDT: "#26a17b",
  USDX: "#0dca82",
  Sukuk: "#f0c040",
};

export type PortfolioChartPoint = { date: string; value: number; gat: number };
export type PortfolioAllocationSlice = { name: string; value: number; color: string };

export function buildPortfolioChart(currentUsd: number, gatUsd = 0): PortfolioChartPoint[] {
  return CHART_MONTHS.map((date, index) => ({
    date,
    value: index === CHART_MONTHS.length - 1 ? Math.max(0, currentUsd) : 0,
    gat: index === CHART_MONTHS.length - 1 ? Math.max(0, gatUsd) : 0,
  }));
}

export function buildAllocationFromHoldings(
  holdings: Record<string, number>,
  extraUsd = 0,
): PortfolioAllocationSlice[] {
  const symbols = CORE_WALLET_SYMBOLS;
  const entries = symbols
    .map((symbol) => ({ name: symbol, usd: tokenToUsd(holdings[symbol] ?? 0, symbol) }))
    .filter((entry) => entry.usd > 0);

  const holdingsTotal = entries.reduce((sum, entry) => sum + entry.usd, 0);
  const total = holdingsTotal + Math.max(0, extraUsd);

  if (total <= 0) return [];

  const slices: PortfolioAllocationSlice[] = entries.map((entry) => ({
    name: entry.name,
    value: Math.max(1, Math.round((entry.usd / total) * 100)),
    color: ALLOCATION_COLORS[entry.name] ?? "#888888",
  }));

  if (extraUsd > 0) {
    slices.push({
      name: "Sukuk",
      value: Math.max(1, Math.round((extraUsd / total) * 100)),
      color: ALLOCATION_COLORS.Sukuk,
    });
  }

  const pctTotal = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (pctTotal !== 100 && slices.length > 0) {
    slices[0] = { ...slices[0], value: slices[0].value + (100 - pctTotal) };
  }

  return slices;
}
