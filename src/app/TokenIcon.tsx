import { useEffect, useMemo, useState } from "react";
import { getLogoCandidates } from "./tokenAssets";
import { useTheme } from "./ThemeContext";

const SIZES = {
  xs: "w-5 h-5",
  sm: "w-7 h-7",
  md: "w-9 h-9",
  lg: "w-10 h-10",
} as const;

export const TokenIcon = ({
  symbol,
  size = "md",
  className = "",
  color = "#0dca82",
  logoUrl,
  contractAddress,
}: {
  symbol: string;
  size?: keyof typeof SIZES;
  className?: string;
  color?: string;
  logoUrl?: string | null;
  contractAddress?: string;
}) => {
  const { isDark } = useTheme();
  const isGat = symbol.toUpperCase() === "GAT";
  const candidates = useMemo(
    () => getLogoCandidates(symbol, contractAddress, logoUrl, isDark),
    [symbol, contractAddress, logoUrl, isDark],
  );
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [candidates]);

  const src = candidates[idx];
  const dim = SIZES[size];
  const logoPad = isGat
    ? (size === "xs" ? "p-[2px]" : size === "sm" ? "p-[3px]" : "p-1")
    : (size === "xs" ? "p-0.5" : "p-1");
  const gatShell = isGat
    ? "bg-transparent ring-1 ring-black/10 dark:ring-white/15"
    : "ring-1 ring-black/10 dark:ring-white/15";

  if (src) {
    return (
      <div
        className={`${dim} rounded-full overflow-hidden shrink-0 ${gatShell} ${className}`}
      >
        <img
          src={src}
          alt={symbol}
          className={`w-full h-full object-contain ${logoPad}`}
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => {
            setIdx((prev) => (prev + 1 < candidates.length ? prev + 1 : candidates.length));
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center text-sm font-bold border-2 shrink-0 ${className}`}
      style={{ borderColor: `${color}50`, backgroundColor: `${color}18`, color }}
    >
      {symbol[0]}
    </div>
  );
};
