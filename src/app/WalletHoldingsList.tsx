import type { CSSProperties } from "react";
import { TokenIcon } from "./TokenIcon";
import { useLanguage } from "./LanguageContext";
import { displayTokenSymbol, type TokenRow } from "./tokenEconomy";

type Props = {
  tokens: TokenRow[];
  hideBalance: boolean;
  formatUsd: (value: number) => string;
};

export const WalletHoldingsList = ({
  tokens,
  hideBalance,
  formatUsd,
}: Props) => {
  const { t } = useLanguage();
  const label = t.wallet.tokenBalances;

  return (
    <div className="gp-holdings-strip relative px-4 py-3">
      <div className="flex items-center justify-between mb-2.5">
        <p className="gp-holdings-strip-label">{label}</p>
        <span className="gp-num gp-holdings-strip-count">{tokens.length}</span>
      </div>

      <div className="relative -mx-1">
        <div className="gp-holdings-fade gp-holdings-fade--left pointer-events-none" aria-hidden />
        <div className="gp-holdings-fade gp-holdings-fade--right pointer-events-none" aria-hidden />
        <div
          className="flex gap-2 overflow-x-auto px-1 pb-0.5 snap-x snap-mandatory"
          style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
        >
          {tokens.map((tok) => {
            const positive = tok.change >= 0;
            const displaySymbol = displayTokenSymbol(tok.symbol);
            return (
              <div
                key={tok.contractAddress ?? tok.symbol}
                className="gp-holdings-card snap-start shrink-0 flex flex-col items-center text-center"
                style={{ "--token-accent": tok.color } as CSSProperties}
              >
                <div className="gp-holdings-icon-ring">
                  <TokenIcon
                    symbol={tok.symbol}
                    size="xs"
                    color={tok.color}
                    logoUrl={tok.logoUrl}
                    contractAddress={tok.contractAddress}
                  />
                </div>
                <span className="gp-holdings-symbol">{displaySymbol}</span>
                <span className="gp-holdings-value gp-num tabular-nums">
                  {hideBalance ? "••••" : formatUsd(tok.usd)}
                </span>
                <span
                  className={`gp-holdings-change gp-num tabular-nums ${
                    positive ? "gp-holdings-change--up" : "gp-holdings-change--down"
                  }`}
                >
                  {positive ? "+" : ""}{tok.change}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
