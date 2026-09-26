import React, { useMemo, useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  TrendingUp, Zap, Sprout, Store, Building2, ChevronRight, Shield,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart as RPieChart, Pie, Cell,
} from "recharts";
import { useApp } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import { InvestPortfolioPanel } from "./InvestPortfolioPanel";
import { PanelErrorBoundary } from "./PanelErrorBoundary";
import { formatUsd } from "./PriceWithGat";
import { tokenToUsd } from "./tokenEconomy";
import { calcInvestProfit, parseApr } from "../lib/invest/investPortfolio";
import { fetchProtocolHealth, type ProtocolHealthReport } from "../lib/protocol/protocolHealthService";
import { buildAllocationFromHoldings, buildPortfolioChart } from "../lib/user/portfolioDisplay";
import { type FundIcon, type InvestmentFund, fundSlotsLeft, isFundAlmostFull, formatCapacityUsd } from "./investData";

const FUND_ICON: Record<FundIcon, React.ReactNode> = {
  zap: <Zap className="w-4 h-4" />,
  sprout: <Sprout className="w-4 h-4" />,
  store: <Store className="w-4 h-4" />,
  building: <Building2 className="w-4 h-4" />,
};

type OppFilter = "all" | "low" | "mudharabah" | "musyarakah" | "sukuk";

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="gp-glass border rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="gp-muted mb-0.5">{label}</p>
      <p className="text-emerald-400 gp-num font-bold text-sm">${payload[0].value.toLocaleString()}</p>
    </div>
  );
};

const GlassCard = ({
  children, className = "", onClick,
}: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
  <div
    className={`gp-glass backdrop-blur-xl border rounded-2xl ${onClick ? "cursor-pointer active:scale-[0.98] transition-transform" : ""} ${className}`}
    onClick={onClick}
  >
    {children}
  </div>
);

const SyariahBadge = () => {
  const { t } = useLanguage();
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold">
      <Shield className="w-2.5 h-2.5" /> {t.syariah}
    </span>
  );
};

const OpportunitiesPanel = ({
  funds,
  onViewFund, onInvest,
}: {
  funds: InvestmentFund[];
  onViewFund: (id: number) => void;
  onInvest: (id: number) => void;
}) => {
  const { t } = useLanguage();
  const il = t.invest;
  const [filter, setFilter] = useState<OppFilter>("all");

  const filters: { id: OppFilter; label: string }[] = [
    { id: "all", label: il.filterAll },
    { id: "low", label: il.filterLowRisk },
    { id: "mudharabah", label: il.filterMudharabah },
    { id: "musyarakah", label: il.filterMusyarakah },
    { id: "sukuk", label: il.filterSukuk },
  ];

  const filtered = useMemo(() => {
    return funds.filter((f) => {
      if (filter === "low") return f.risk === "Low";
      if (filter === "mudharabah") return f.type === "Mudharabah";
      if (filter === "musyarakah") return f.type === "Musyarakah";
      if (filter === "sukuk") return f.type === "Ijarah Sukuk";
      return true;
    });
  }, [filter, funds]);

  const fundDesc = (id: number) => il.fundDesc[id as keyof typeof il.fundDesc] ?? "";

  return (
    <div className="gp-invest-section">
      <p className="gp-invest-opp-sub">{il.opportunitiesSubtitle}</p>

      <div className="gp-invest-filters">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
              filter === f.id ? "gp-pill-active" : "gp-pill"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="gp-muted text-sm text-center py-8">{il.noFundsMatch}</p>
      ) : (
        filtered.map((inv, i) => (
          <OpportunityCard
            key={inv.id}
            fund={inv}
            index={i}
            desc={fundDesc(inv.id)}
            onView={() => onViewFund(inv.id)}
            onInvest={() => onInvest(inv.id)}
          />
        ))
      )}
    </div>
  );
};

const OpportunityCard = ({
  fund, index, desc, onView, onInvest,
}: {
  fund: InvestmentFund; index: number; desc: string;
  onView: () => void; onInvest: () => void;
}) => {
  const { t } = useLanguage();
  const il = t.invest;
  const slotsLeft = fundSlotsLeft(fund);
  const isAlmostFull = isFundAlmostFull(fund);
  const minGat = (fund.min / tokenToUsd(1, "GAT")).toFixed(1);
  const contractHint = il.contractTypes[fund.type];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
      <GlassCard className="gp-invest-card gp-invest-card--interactive p-4 hover:border-emerald-500/25 transition-all" onClick={onView}>
        <div className="flex items-start gap-3 mb-2">
          <div className="p-2.5 rounded-xl gp-subtle border text-emerald-400 shrink-0">
            {FUND_ICON[fund.icon]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="gp-text font-semibold text-sm leading-tight">{fund.name}</p>
              <div className="text-right shrink-0">
                <p className="gp-num text-emerald-400 font-black text-lg leading-none">{fund.apr}</p>
                <p className="gp-muted text-[9px]">{t.apr}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 ${fund.typeColor}`}>
                {fund.type}
              </span>
              <SyariahBadge />
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                isAlmostFull ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-400"
              }`}>
                {isAlmostFull ? il.almostFull : il.available}
              </span>
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {fund.round}
              </span>
            </div>
          </div>
        </div>

        <p className="gp-muted text-[11px] leading-relaxed mb-2">{desc}</p>
        <p className="gp-muted text-[10px] italic mb-3 opacity-80">{contractHint}</p>

        <div className="h-1.5 gp-progress-track rounded-full overflow-hidden mb-1.5">
          <motion.div
            className={`h-full rounded-full ${isAlmostFull ? "bg-gradient-to-r from-amber-500 to-orange-400" : "bg-gradient-to-r from-emerald-500 to-teal-400"}`}
            initial={{ width: 0 }}
            animate={{ width: `${fund.raised}%` }}
            transition={{ duration: 0.8, delay: index * 0.08 }}
          />
        </div>
        <div className="flex justify-between mb-3">
          <span className="gp-muted text-[10px]">{fund.raised}% {il.raised}</span>
          <span className="gp-muted text-[10px]">{il.slotsLeft(slotsLeft)} · {formatCapacityUsd(fund.capacityUsd)}</span>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] mb-3">
          <span className="gp-muted">{il.min}: <span className="gp-text gp-num">${fund.min}</span> ◈ {minGat} GAT</span>
          <span className="gp-muted">{il.term}: <span className="gp-text">{fund.term}</span></span>
          <span className="gp-muted">{t.risk}: <span className={fund.risk === "Low" ? "text-emerald-400" : "text-amber-400"}>{t.riskLevels[fund.risk]}</span></span>
          <span className="gp-muted truncate">{il.categoryLabel}: <span className="gp-text">{fund.category}</span></span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onView(); }}
            className="flex-1 py-2.5 rounded-xl border border-emerald-500/30 text-emerald-400 text-xs font-semibold gp-hover-row"
          >
            {il.viewDetail}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onInvest(); }}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black text-xs font-semibold flex items-center justify-center gap-1"
          >
            <TrendingUp className="w-3.5 h-3.5" /> {il.investBtn}
          </button>
        </div>
      </GlassCard>
    </motion.div>
  );
};

export const InvestScreen = () => {
  const {
    openDetail, requestOverlay, investedFunds, investPositions,
    portfolioProfit, portfolioStakingRewardsByToken, pendingInvestTab, clearInvestTab, portfolioUsd,
    investmentFunds,
  } = useApp();
  const { t } = useLanguage();
  const il = t.invest;
  const [tab, setTab] = useState<"overview" | "portfolio" | "opportunities">("overview");
  const [chartPeriod, setChartPeriod] = useState("6M");
  const [protocolHealth, setProtocolHealth] = useState<ProtocolHealthReport | null>(null);

  useEffect(() => {
    void fetchProtocolHealth().then(setProtocolHealth);
  }, []);

  useEffect(() => {
    if (!pendingInvestTab) return;
    setTab(pendingInvestTab);
    clearInvestTab();
  }, [pendingInvestTab, clearInvestTab]);

  const totalInvested = Object.values(investedFunds).reduce((s, v) => s + v, 0);
  const profitPct = totalInvested > 0 ? ((portfolioProfit / totalInvested) * 100).toFixed(2) : "0";
  const activeCount = new Set(investPositions.map((p) => p.fundId)).size;
  const portfolioChart = buildPortfolioChart(portfolioUsd + totalInvested, portfolioProfit);
  const allocation = buildAllocationFromHoldings({}, totalInvested);

  const handleViewFund = (id: number) => openDetail({ kind: "fund", id });
  const handleInvest = (id: number) => {
    openDetail({ kind: "fund", id });
    requestOverlay("invest");
  };

  const stakingRewardLabel = (() => {
    const parts: string[] = [];
    const rewards = portfolioStakingRewardsByToken ?? {};
    if (rewards.GAT) parts.push(`+${rewards.GAT.toFixed(1)} GAT`);
    if (rewards.SDA) parts.push(`+${rewards.SDA.toFixed(1)} SDA`);
    return parts.length ? parts.join(" · ") : "+0 GAT";
  })();

  return (
    <div className="gp-invest-page pb-2">
      <header className="gp-invest-hero">
        <h2 className="gp-invest-hero__title">{t.screens.invest}</h2>
        <p className="gp-invest-hero__sub">{il.allSyariah}</p>
      </header>

      {protocolHealth && protocolHealth.warnings.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 text-[10px] leading-relaxed text-amber-200/90">
          <p className="font-semibold text-amber-300">
            {il.protocolHealthTitle ?? "Status protokol on-chain"}
          </p>
          <ul className="mt-1 list-disc pl-4 space-y-0.5 gp-muted">
            {protocolHealth.warnings.slice(0, 3).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          {!protocolHealth.readyForInvest && (
            <p className="mt-1.5 text-amber-300/90">
              {il.protocolInvestPaused ?? "Investasi on-chain sementara tidak tersedia hingga pool dikonfigurasi."}
            </p>
          )}
        </div>
      )}

      <div className="gp-invest-stats">
        {[
          { label: il.invested, value: formatUsd(totalInvested), sub: `${activeCount} ${il.funds}`, color: "gp-text" },
          { label: il.totalProfit, value: `+${formatUsd(portfolioProfit)}`, sub: `+${profitPct}%`, color: "text-emerald-400" },
          { label: il.stakingRewards, value: stakingRewardLabel, sub: il.stakingActive, color: "text-amber-400" },
        ].map((s) => (
          <div key={s.label} className="gp-invest-stat" title={`${s.value} · ${s.sub}`}>
            <p className="gp-invest-stat__label">{s.label}</p>
            <p
              className={`gp-invest-stat__value ${s.color}${
                s.value.includes("·") ? " gp-invest-stat__value--wrap" : ""
              }`}
            >
              {s.value}
            </p>
            <p className="gp-invest-stat__sub">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 gp-invest-tabs gp-tab-bar">
        {(["overview", "portfolio", "opportunities"] as const).map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => setTab(tabKey)}
            className={`flex-1 py-2.5 rounded-xl text-[11px] font-semibold transition-all ${
              tab === tabKey ? "gp-pill-active" : "gp-muted"
            }`}
          >
            {tabKey === "overview" ? il.overview : tabKey === "portfolio" ? il.portfolio : il.opportunities}
          </button>
        ))}
      </div>

      {tab === "portfolio" ? (
        <PanelErrorBoundary title="Portofolio gagal dimuat">
          <InvestPortfolioPanel onInvestFund={handleInvest} onViewFund={handleViewFund} />
        </PanelErrorBoundary>
      ) : tab === "overview" ? (
        <>
          <GlassCard className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="gp-text font-semibold text-sm">{il.portfolioGrowth}</h3>
              <div className="flex gap-2">
                {["1M", "3M", "6M", "1Y"].map((p) => (
                  <button key={p} type="button" onClick={() => setChartPeriod(p)} className={`text-[11px] px-2 py-0.5 rounded-lg ${chartPeriod === p ? "gp-pill-active" : "gp-muted"}`}>{p}</button>
                ))}
              </div>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={portfolioChart}>
                  <defs>
                    <linearGradient id="iGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0dca82" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#0dca82" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="iGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f0c040" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#f0c040" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: "#6b87b0", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="value" stroke="#0dca82" strokeWidth={2} fill="url(#iGrad)" dot={false} />
                  <Area type="monotone" dataKey="gat" stroke="#f0c040" strokeWidth={1.5} fill="url(#iGrad2)" dot={false} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <h3 className="gp-text font-semibold text-sm mb-4">{il.assetAllocation}</h3>
            {allocation.length === 0 ? (
              <p className="gp-muted text-xs text-center py-6">{il.noFundsMatch}</p>
            ) : (
            <div className="flex items-center gap-4">
              <div className="w-28 h-28 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <RPieChart>
                    <Pie data={allocation} cx="50%" cy="50%" innerRadius={30} outerRadius={52} dataKey="value" strokeWidth={0}>
                      {allocation.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                  </RPieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {allocation.map((a) => (
                  <div key={a.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color }} />
                      <span className="gp-muted text-xs">{a.name}</span>
                    </div>
                    <span className="gp-text text-xs gp-num font-medium">{a.value}%</span>
                  </div>
                ))}
              </div>
            </div>
            )}
          </GlassCard>

          <div className="gp-invest-section">
            <div className="gp-invest-section__head">
              <h3 className="gp-invest-section__title">{il.myInvestments}</h3>
              <button type="button" onClick={() => setTab("portfolio")} className="text-emerald-400 text-[10px] font-semibold">{il.viewAll}</button>
            </div>
            {investPositions.slice(0, 3).map((pos) => {
              const inv = investmentFunds.find((f) => f.id === pos.fundId);
              if (!inv) return null;
              const profit = calcInvestProfit(pos.principalUsd, parseApr(inv.apr), pos.startedAt);
              return (
              <GlassCard key={pos.id} className="gp-invest-card gp-invest-card--interactive p-4 mb-2 cursor-pointer hover:border-emerald-500/20" onClick={() => handleViewFund(pos.fundId)}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="gp-text font-semibold text-sm">{inv.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[11px] font-medium ${inv.typeColor}`}>{inv.type}</span>
                      <SyariahBadge />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="gp-num text-emerald-400 font-bold text-base">{inv.apr}</p>
                    <p className="gp-muted text-[10px]">{t.apr}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="gp-muted">{il.investedLabel}: <span className="gp-text gp-num">{formatUsd(pos.principalUsd)}</span></span>
                  <span className="gp-muted">{il.profitLabel}: <span className="text-emerald-400 gp-num">+{formatUsd(profit)}</span></span>
                </div>
              </GlassCard>
              );
            })}
          </div>

          <div className="gp-invest-actions">
            <button
              type="button"
              onClick={() => setTab("portfolio")}
              className="gp-invest-action gp-invest-action--cyan"
            >
              {il.managePortfolio} <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setTab("opportunities")}
              className="gp-invest-action gp-invest-action--emerald"
            >
              {il.investNowBtn} <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : (
        <OpportunitiesPanel funds={investmentFunds} onViewFund={handleViewFund} onInvest={handleInvest} />
      )}
    </div>
  );
};
