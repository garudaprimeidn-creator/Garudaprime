import { usdToToken, GAT_NOT_LISTED_LABEL } from "./tokenEconomy";

export const formatUsd = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

export const formatGatFromUsd = (usd: number) => {
  const gat = usdToToken(usd, "GAT");
  if (!gat || !Number.isFinite(gat)) return GAT_NOT_LISTED_LABEL;
  return `${gat.toFixed(2)} GAT`;
};

export const PriceWithGat = ({
  usd,
  size = "md",
  align = "left",
}: {
  usd: number;
  size?: "sm" | "md" | "lg";
  align?: "left" | "right";
}) => {
  const usdClass =
    size === "lg"
      ? "text-2xl font-black text-emerald-400 leading-tight"
      : size === "md"
        ? "text-xs font-bold text-emerald-400"
        : "text-[10px] font-semibold text-emerald-400";

  const gatClass =
    size === "lg"
      ? "gp-num text-base font-bold text-teal-500 mt-1"
      : size === "md"
        ? "gp-num text-[11px] font-semibold text-teal-500/90 mt-0.5"
        : "gp-num text-[9px] font-medium text-teal-500/80 mt-0.5";

  return (
    <div className={align === "right" ? "text-right shrink-0" : ""}>
      <p className={`gp-num tabular-nums ${usdClass}`}>{formatUsd(usd)}</p>
      <p className={`${gatClass} tabular-nums`}>{formatGatFromUsd(usd)}</p>
    </div>
  );
};
