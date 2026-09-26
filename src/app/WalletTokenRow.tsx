import { TokenIcon } from "./TokenIcon";
import { displayTokenSymbol, getTokenPriceUsd, GAT_NOT_LISTED_LABEL } from "./tokenEconomy";

export type WalletTokenRowData = {
  symbol: string;
  name: string;
  balance: number;
  usd: number;
  change: number;
  color: string;
  logoUrl?: string;
  contractAddress?: string;
};

const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatUnitPrice = (symbol: string): string => {
  const key = symbol.toUpperCase();
  const price = getTokenPriceUsd(key);
  if (key === "GAT" && price === 0) return GAT_NOT_LISTED_LABEL;
  if (!Number.isFinite(price) || price <= 0) return ", ";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: price >= 100 ? 2 : 4,
  }).format(price);
};

const formatListBalance = (balance: number, symbol: string) => {
  if (symbol === "ETH") {
    return balance.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }
  return balance.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 6 });
};

const formatChange = (change: number) => {
  const rounded = Math.abs(change) < 0.05 ? change.toFixed(1) : change.toFixed(1);
  return `${change >= 0 ? "+" : ""}${rounded}%`;
};

type WalletTokenRowProps = {
  token: WalletTokenRowData;
  hideBalance?: boolean;
};

export const WalletTokenRow = ({ token, hideBalance = false }: WalletTokenRowProps) => {
  const positive = token.change >= 0;
  const unitPrice = formatUnitPrice(token.symbol);
  const isListed = unitPrice !== GAT_NOT_LISTED_LABEL && unitPrice !== ", ";
  const displaySymbol = displayTokenSymbol(token.symbol);

  return (
    <div className="gp-wallet-asset-row">
      <div className="gp-wallet-asset-row__icon">
        <TokenIcon
          symbol={token.symbol}
          size="md"
          color={token.color}
          logoUrl={token.logoUrl}
          contractAddress={token.contractAddress}
        />
      </div>
      <p className="gp-wallet-asset-row__symbol gp-text">{displaySymbol}</p>
      <p className="gp-wallet-asset-row__balance gp-text gp-num">
        {hideBalance ? "••••" : formatListBalance(token.balance, token.symbol)}
      </p>
      <p className="gp-wallet-asset-row__quote gp-num">
        <span className="gp-wallet-asset-row__price gp-muted">{unitPrice}</span>
        {isListed && (
          <span
            className={`gp-wallet-asset-row__change ${
              positive ? "gp-wallet-asset-row__change--up" : "gp-wallet-asset-row__change--down"
            }`}
          >
            {formatChange(token.change)}
          </span>
        )}
      </p>
      <p className="gp-wallet-asset-row__value gp-muted gp-num">
        {hideBalance ? "••••" : `≈ ${formatUsd(token.usd)}`}
      </p>
    </div>
  );
};
