import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchWalletBalances } from "../../lib/web3/tokenBalances";

const formatToken = (value: number | null, symbol: string) => {
  if (value == null) return `,  ${symbol}`;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`;
};

type Props = {
  address: string;
  loadingLabel: string;
  balanceLabel: string;
  /** Sembunyikan SDA (gas sponsor treasury / Garuda native) di Dompet Terhubung. */
  hideSda?: boolean;
};

export function ConnectedWalletBalance({ address, loadingLabel, balanceLabel, hideSda = false }: Props) {
  const [gat, setGat] = useState<number | null>(null);
  const [sda, setSda] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchWalletBalances(address).then((balances) => {
      if (cancelled) return;
      setGat(balances.gat);
      setSda(balances.sda);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [address]);

  if (loading) {
    return (
      <p className="flex items-center gap-1.5 gp-muted text-[10px] mb-2">
        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        {loadingLabel}
      </p>
    );
  }

  return (
    <p className="gp-muted text-[10px] mb-2">
      <span className="font-semibold gp-text">{balanceLabel}:</span>{" "}
      <span className="gp-num">{formatToken(gat, "GAT")}</span>
      {!hideSda && (
        <>
          <span className="mx-1 opacity-40">·</span>
          <span className="gp-num">{formatToken(sda, "SDA")}</span>
        </>
      )}
    </p>
  );
}
