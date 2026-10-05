import React, { useEffect, useState } from "react";
import { X, Layers, ExternalLink, Loader2, Activity } from "lucide-react";
import { useLanguage } from "./LanguageContext";
import { GAT_TOKEN } from "../lib/web3/gatToken";
import {
  fetchSidraStats, fetchSidraToken, sidraExplorerUrl, type SidraChainStats, type SidraTokenInfo,
} from "../lib/web3/sidraExplorer";

type Props = { onClose: () => void };

export const SidraChainPanel = ({ onClose }: Props) => {
  const { t } = useLanguage();
  const gc = t.garudaChain;
  const sc = t.sidraChain;

  const [stats, setStats] = useState<SidraChainStats | null>(null);
  const [gatInfo, setGatInfo] = useState<SidraTokenInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchSidraStats(),
      GAT_TOKEN.address ? fetchSidraToken(GAT_TOKEN.address) : Promise.resolve(null),
    ]).then(([nextStats, nextGat]) => {
      if (cancelled) return;
      setStats(nextStats);
      setGatInfo(nextGat);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="gp-panel-header flex items-start gap-3 p-4 pt-6 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
          <Layers className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="gp-text font-bold text-base leading-tight">{sc.title}</h3>
          <p className="gp-muted text-xs mt-0.5">{sc.subtitle}</p>
        </div>
        <button type="button" onClick={onClose} className="gp-muted gp-icon-btn p-1 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="gp-panel-body p-4 space-y-4" style={{ scrollbarWidth: "none" }}>
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
          </div>
        )}

        {!loading && stats && (
          <div className="rounded-2xl border gp-glass p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="gp-text text-sm font-semibold flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400" /> {gc.liveStatsTitle}
              </p>
              <a
                href={sidraExplorerUrl("/stats")}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-emerald-400 flex items-center gap-0.5 hover:underline"
              >
                Blockscout <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: gc.statBlocks, value: Number(stats.totalBlocks).toLocaleString() },
                { label: gc.statTxs, value: Number(stats.totalTransactions).toLocaleString() },
                { label: gc.statGas, value: `${stats.gasPriceGwei} Gwei` },
                { label: gc.statTxToday, value: Number(stats.transactionsToday).toLocaleString() },
              ].map((s) => (
                <div key={s.label} className="rounded-xl gp-subtle p-2.5">
                  <p className="gp-muted text-[10px]">{s.label}</p>
                  <p className="gp-num gp-text font-bold text-sm mt-0.5">{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && gatInfo && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 text-xs">
            <p className="gp-text font-semibold mb-2">{gatInfo.name} ({gatInfo.symbol})</p>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="gp-muted">{gc.gatSupply}</span><p className="gp-text font-semibold">{gatInfo.totalSupply}</p></div>
              <div><span className="gp-muted">{gc.gatHolders}</span><p className="gp-text font-semibold">{gatInfo.holders}</p></div>
            </div>
            <a href={sidraExplorerUrl(`/token/${gatInfo.address}`)} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-emerald-400 mt-2 hover:underline text-[10px]">
              {gc.viewExplorer} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {!loading && !stats && !gatInfo && (
          <div className="rounded-2xl border gp-glass p-4 text-xs space-y-2">
            <p className="gp-muted leading-relaxed">{sc.unavailable}</p>
            <a href={sidraExplorerUrl("/")} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-emerald-400 hover:underline text-[10px]">
              {gc.viewExplorer} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
