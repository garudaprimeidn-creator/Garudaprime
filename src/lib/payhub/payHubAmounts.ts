import { getTokenPriceUsd, usdToToken } from "../../app/tokenEconomy";

/** Internal Pay Hub peg when GAT has no listed USD price (1 GAT = 1 USD). */
export const GAT_PAYHUB_USD_PEG = 1;

/** GAT amount debited/credited on Pay Hub ledger. */
export const usdToGatPayHub = (usd: number): number => {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  const fromMarket = usdToToken(usd, "GAT");
  if (fromMarket > 0 && Number.isFinite(fromMarket)) return fromMarket;
  return usd * GAT_PAYHUB_USD_PEG;
};

export const isGatUsingPayHubPeg = (): boolean => getTokenPriceUsd("GAT") <= 0;

export const formatGatPayHubFromUsd = (usd: number): string =>
  `${usdToGatPayHub(usd).toFixed(2)} GAT`;

export const hasEnoughPayHubGat = (balance: number, need: number): boolean =>
  Number.isFinite(need) && need > 0 && balance >= need - 1e-9;
