import { getTokenPriceUsd, GAT_NOT_LISTED_LABEL } from "./tokenEconomy";

const formatPrice = (usd: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: usd >= 100 ? 0 : 2,
    maximumFractionDigits: usd >= 100 ? 0 : 2,
  }).format(usd);

export const TokenUnitPrice = ({ symbol, className = "" }: { symbol: string; className?: string }) => {
  const key = symbol.toUpperCase();
  const price = getTokenPriceUsd(key);
  const base = `gp-num gp-muted text-[10px] leading-none ${className}`.trim();
  if (key === "GAT" && price === 0) {
    return (
      <span className={base}>
        @ {GAT_NOT_LISTED_LABEL}
      </span>
    );
  }
  if (!Number.isFinite(price) || price <= 0) {
    return (
      <span className={base}>
        @ , 
      </span>
    );
  }
  return (
    <span className={base}>
      @ {formatPrice(price)}
    </span>
  );
};
