import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  X, RefreshCw, ChevronRight, Shield, Award, Gem, TrendingUp,
  Layers, Trophy, Server, ExternalLink, CheckCircle, Lock, Clock,
} from "lucide-react";
import { useLanguage } from "../../app/LanguageContext";
import { showAppToast } from "../../app/appToast";
import {
  fetchUtilityNftPortfolio,
  syncUtilityNfts,
} from "../../lib/nft/utilityNftService";
import type { UtilityNftGroup, UtilityNftItem, UtilityNftPortfolio } from "../../lib/nft/utilityNftTypes";
import { sidraExplorerAddressUrl, sidraExplorerTxUrl } from "../../lib/web3/sidraExplorer";
import { formatAddress } from "../../lib/web3/walletService";

type Props = {
  onClose: () => void;
};

const GROUP_ICONS: Record<UtilityNftGroup, React.ReactNode> = {
  membership: <Gem className="w-4 h-4 text-amber-400" />,
  identity: <Shield className="w-4 h-4 text-emerald-400" />,
  investment: <TrendingUp className="w-4 h-4 text-cyan-400" />,
  staking: <Layers className="w-4 h-4 text-violet-400" />,
  achievement: <Trophy className="w-4 h-4 text-amber-300" />,
  validator: <Server className="w-4 h-4 text-emerald-300" />,
};

function StatusBadge({ item, labels }: { item: UtilityNftItem; labels: Record<string, string> }) {
  if (item.status === "owned") {
    return (
      <span className="gp-nft-badge gp-nft-badge--owned">
        <CheckCircle className="w-3 h-3" />
        {labels.owned}
      </span>
    );
  }
  if (item.status === "pending_mint") {
    return (
      <span className="gp-nft-badge gp-nft-badge--pending">
        <Clock className="w-3 h-3" />
        {labels.pending}
      </span>
    );
  }
  if (item.status === "eligible") {
    return (
      <span className="gp-nft-badge gp-nft-badge--eligible">
        {labels.eligible}
      </span>
    );
  }
  return (
    <span className="gp-nft-badge gp-nft-badge--locked">
      <Lock className="w-3 h-3" />
      {labels.locked}
    </span>
  );
}

function NftCard({
  item,
  labels,
  onCopy,
}: {
  item: UtilityNftItem;
  labels: Record<string, string>;
  onCopy: (text: string, msg: string) => void;
}) {
  const issued = item.issuedAt
    ? new Date(item.issuedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "-";

  return (
    <div className="gp-nft-card gp-glass border rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="gp-nft-card__icon shrink-0">
          {GROUP_ICONS[item.group]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="gp-text text-sm font-bold leading-snug">{item.title}</h4>
            <StatusBadge item={item} labels={labels} />
          </div>
          <p className="gp-muted text-xs mt-1.5 leading-relaxed">{item.utility}</p>
        </div>
      </div>

      <div className="gp-nft-card__meta grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <p className="gp-muted uppercase tracking-wider">{labels.issued}</p>
          <p className="gp-text font-medium mt-0.5">{issued}</p>
        </div>
        <div>
          <p className="gp-muted uppercase tracking-wider">{labels.onChain}</p>
          <p className="gp-text font-medium mt-0.5">
            {item.onChainVerified ? labels.verified : labels.offChain}
          </p>
        </div>
        {item.tokenId && (
          <div className="col-span-2">
            <p className="gp-muted uppercase tracking-wider">{labels.tokenId}</p>
            <p className="gp-num gp-text text-xs font-semibold mt-0.5">#{item.tokenId}</p>
          </div>
        )}
      </div>

      {(item.txHash || item.contractAddress) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {item.txHash && (
            <a
              href={sidraExplorerTxUrl(item.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="gp-nft-link"
            >
              {labels.viewTx}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {item.contractAddress && (
            <button
              type="button"
              onClick={() => onCopy(item.contractAddress!, labels.contractCopied)}
              className="gp-nft-link"
            >
              {formatAddress(item.contractAddress)}
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {item.soulbound && (
        <p className="gp-nft-soulbound text-[10px]">{labels.soulbound}</p>
      )}
    </div>
  );
}

export function NftIdentityPanel({ onClose }: Props) {
  const { t, lang } = useLanguage();
  const nft = t.wallet.nftIdentity;
  const locale = lang === "en" ? "en" : "id";

  const [portfolio, setPortfolio] = useState<UtilityNftPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeGroup, setActiveGroup] = useState<UtilityNftGroup | "all">("all");

  const labels = useMemo(() => ({
    owned: nft.statusOwned,
    eligible: nft.statusEligible,
    locked: nft.statusLocked,
    pending: nft.statusPending,
    issued: nft.issuedLabel,
    onChain: nft.onChainLabel,
    verified: nft.onChainYes,
    offChain: nft.onChainNo,
    tokenId: nft.tokenIdLabel,
    viewTx: nft.viewTx,
    contractCopied: nft.contractCopied,
    soulbound: nft.soulboundHint,
  }), [nft]);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchUtilityNftPortfolio(locale);
    setPortfolio(data);
    setLoading(false);
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncUtilityNfts(locale);
      if (result?.portfolio) {
        setPortfolio(result.portfolio);
        showAppToast(
          result.minted > 0 ? nft.syncSuccess(result.minted) : nft.syncNone,
          result.minted > 0 ? "success" : "warning",
        );
      } else {
        showAppToast(nft.syncFailed, "error");
      }
    } finally {
      setSyncing(false);
    }
  };

  const groups: { id: UtilityNftGroup | "all"; label: string }[] = [
    { id: "all", label: nft.filterAll },
    { id: "membership", label: nft.filterMembership },
    { id: "identity", label: nft.filterIdentity },
    { id: "investment", label: nft.filterInvestment },
    { id: "staking", label: nft.filterStaking },
    { id: "achievement", label: nft.filterAchievement },
    { id: "validator", label: nft.filterValidator },
  ];

  const filtered = portfolio?.items.filter(
    (i) => activeGroup === "all" || i.group === activeGroup,
  ) ?? [];

  const handleCopy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showAppToast(msg, "success");
    } catch {
      showAppToast(nft.copyFailed, "error");
    }
  };

  return (
    <div className="relative flex flex-col h-full min-h-0">
      <div className="gp-panel-header gp-panel-header--emerald flex items-center justify-between px-4 py-3 border-b gp-divider shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5 text-emerald-400" />
          </span>
          <div className="min-w-0">
            <h2 className="gp-text font-bold text-base truncate">{nft.title}</h2>
            <p className="gp-muted text-xs truncate">{nft.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing || loading}
            className="gp-icon-btn gp-icon-btn--compact"
            aria-label={nft.syncLabel}
          >
            <RefreshCw className={`w-4 h-4${syncing ? " animate-spin" : ""}`} />
          </button>
          <button type="button" onClick={onClose} className="gp-icon-btn gp-icon-btn--compact" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="gp-panel-body flex-1 overflow-y-auto px-4 pb-8 pt-4 space-y-4 min-h-0">
        {portfolio && (
          <div className="gp-nft-stats grid grid-cols-3 gap-2">
            <div className="gp-nft-stat gp-glass rounded-xl p-3 text-center border">
              <p className="gp-num text-lg font-black text-emerald-400">{portfolio.owned}</p>
              <p className="gp-muted text-[10px] mt-0.5">{nft.statOwned}</p>
            </div>
            <div className="gp-nft-stat gp-glass rounded-xl p-3 text-center border">
              <p className="gp-num text-lg font-black gp-text">{portfolio.total}</p>
              <p className="gp-muted text-[10px] mt-0.5">{nft.statTotal}</p>
            </div>
            <div className="gp-nft-stat gp-glass rounded-xl p-3 text-center border">
              <p className="gp-num text-lg font-black text-amber-400">{portfolio.pendingMint}</p>
              <p className="gp-muted text-[10px] mt-0.5">{nft.statPending}</p>
            </div>
          </div>
        )}

        <div className="gp-nft-network gp-glass rounded-xl px-3 py-2.5 border border-emerald-500/20 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="gp-muted text-[10px] uppercase tracking-wider">{nft.networkLabel}</p>
            <p className="gp-text text-xs font-semibold truncate">
              {portfolio?.network ?? "Sidra Network"}
              {portfolio?.chainId ? ` · ${portfolio.chainId}` : ""}
            </p>
          </div>
          {portfolio?.onChainConfigured ? (
            <span className="gp-nft-badge gp-nft-badge--owned shrink-0">{nft.scConnected}</span>
          ) : (
            <span className="gp-nft-badge gp-nft-badge--pending shrink-0">{nft.scPending}</span>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setActiveGroup(g.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                activeGroup === g.id ? "gp-pill-active" : "gp-pill"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <RefreshCw className="w-6 h-6 mx-auto gp-muted animate-spin mb-2" />
            <p className="gp-muted text-xs">{nft.loading}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="gp-glass rounded-2xl border p-6 text-center">
            <p className="gp-muted text-sm">{nft.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <NftCard key={item.id} item={item} labels={labels} onCopy={handleCopy} />
            ))}
          </div>
        )}

        {portfolio?.contractAddress && (
          <div className="gp-muted text-[10px] text-center leading-relaxed px-2">
            {nft.contractHint}{" "}
            <a
              href={sidraExplorerAddressUrl(portfolio.contractAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 underline-offset-2 hover:underline"
            >
              {formatAddress(portfolio.contractAddress)}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
