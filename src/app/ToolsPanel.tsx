import React, { useState, useEffect } from "react";
import {
  X, BarChart3, FileText, Smartphone, Key, HelpCircle,
  TrendingUp, Download,
  Wallet, Copy, ChevronDown, ChevronUp, MessageCircle, Mail,
  CheckCircle, Store, QrCode, DollarSign, Package,
  Coins, ArrowLeftRight, Send,   ArrowDownLeft, FileSpreadsheet, CalendarRange,
  Users, Gift, Trash2, Loader2, Star, RefreshCw,
} from "lucide-react";
import { useApp, type ToolPanelId } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { WalletConnectModal } from "../features/auth/WalletConnectModal";
import { resolveTxTypeLabel, txVisual } from "./TransactionRow";
import { sanitizeTransactionHistory } from "../lib/user/transactionSanitizer";
import { activityTimeGroup, ACTIVITY_GROUP_ORDER } from "../lib/user/activityTimeGroup";
import { formatTxDisplayTime, formatTxUsdDisplay } from "../lib/user/txDisplay";
import {
  formatWalletAddressShort,
  mergeConnectedWalletRowsForDisplay,
  resolvePrimaryWalletAddress,
  resolveFirestoreWalletProvider,
  resolveWalletDisplayLabel,
  resolveWalletRowDisplay,
  shouldHideConnectedWalletSdaBalance,
  syncWalletProviderLocksFromFirestore,
} from "../lib/web3/connectedWalletUtils";
import { ConnectedWalletBalance } from "../features/wallet/ConnectedWalletBalance";
import { GarudaProcessOverlay } from "../features/wallet/GarudaProcessOverlay";
import {
  deleteUserDeviceDoc,
  getConnectedWalletDocs,
  getUserDeviceDocs,
  registerUserDeviceSession,
  type ConnectedWalletDoc,
  type UserDeviceDoc,
} from "../lib/firebase/firestoreService";
import {
  currentDeviceFallback,
  formatActivityTimestamp,
  isCurrentDeviceSession,
  mergeWithCurrentDevice,
} from "../lib/auth/deviceSessions";
import { TokenIcon } from "./TokenIcon";
import { ToolInfoBox } from "./ToolGuideSheet";
import { PAY_HUB } from "../lib/payhub/payHubService";
import { walletErrorKey } from "../lib/web3/walletErrors";
import { MerchantCenterPanel } from "./MerchantCenterPanel";
import { BuyerOrdersPanel } from "./BuyerOrdersPanel";
import { type ReferralStats } from "../lib/referral/referralService";
import { ReferralLockedNotice } from "../features/referral/ReferralLockedNotice";
import { isReferralProgramVisible, isReferralUsageEnabled } from "../lib/referral/referralProgramGate";
import { PanelErrorBoundary } from "./PanelErrorBoundary";

const TOOL_ICONS: Record<ToolPanelId, React.ReactNode> = {
  analytics: <BarChart3 className="w-5 h-5" />,
  reports: <FileText className="w-5 h-5" />,
  devices: <Smartphone className="w-5 h-5" />,
  wallets: <Key className="w-5 h-5" />,
  help: <HelpCircle className="w-5 h-5" />,
  merchant: <Store className="w-5 h-5" />,
  assets: <Coins className="w-5 h-5" />,
  transactions: <ArrowLeftRight className="w-5 h-5" />,
  "referral-dashboard": <Users className="w-5 h-5" />,
  "sidra-chain": <BarChart3 className="w-5 h-5" />,
  "my-orders": <Package className="w-5 h-5" />,
};

type HeaderAccent = "emerald" | "cyan" | "violet" | "amber" | "orange" | "fuchsia" | "sky" | "teal" | "indigo";

const HEADER_ACCENT: Record<HeaderAccent, { bg: string; border: string; text: string }> = {
  emerald: { bg: "bg-emerald-500/15", border: "border-emerald-500/25", text: "gp-read-emerald" },
  cyan: { bg: "bg-cyan-500/15", border: "border-cyan-500/25", text: "gp-read-cyan" },
  violet: { bg: "bg-violet-500/15", border: "border-violet-500/25", text: "gp-read-violet" },
  amber: { bg: "bg-amber-500/15", border: "border-amber-500/25", text: "gp-read-amber" },
  orange: { bg: "bg-orange-500/15", border: "border-orange-500/25", text: "gp-read-orange" },
  fuchsia: { bg: "bg-fuchsia-500/15", border: "border-fuchsia-500/25", text: "gp-read-fuchsia" },
  sky: { bg: "bg-sky-500/15", border: "border-sky-500/25", text: "gp-read-sky" },
  teal: { bg: "bg-teal-500/15", border: "border-teal-500/25", text: "gp-read-teal" },
  indigo: { bg: "bg-indigo-500/15", border: "border-indigo-500/25", text: "gp-read-indigo" },
};

const parseUsd = (s?: string) => {
  const n = parseFloat(String(s ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
};

const formatUsd = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

export const ToolsPanel = ({ tool, onClose }: { tool: ToolPanelId; onClose: () => void }) => {
  const {
    transactions, showToast, copyText, walletAddress, openDetail, openCommunity,
    tokens, portfolioUsd, profileName, merchantPanelTab, referralCode,
    referralStats, refreshReferralStats, investPositions, portfolioProfit, portfolioStakingReward,
    referralConfig, refreshWalletActivity,
  } = useApp();
  const { t, lang } = useLanguage();
  const { connectedWallet, user, userProfile, disconnectWeb3Wallet, setPrimaryWeb3Wallet, refreshUserProfile, signOut } = useAuth();
  const tp = t.toolsPanel;
  const tg = t.toolsGuide;
  const portfolio = portfolioUsd;
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [txFilter, setTxFilter] = useState<"all" | "receive" | "send" | "pay" | "invest">("all");
  const [reportPeriod, setReportPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [deviceRows, setDeviceRows] = useState<UserDeviceDoc[]>([]);
  const [walletRows, setWalletRows] = useState<ConnectedWalletDoc[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [deviceBusyId, setDeviceBusyId] = useState<string | null>(null);
  const [walletBusyId, setWalletBusyId] = useState<string | null>(null);
  const [primaryBusyId, setPrimaryBusyId] = useState<string | null>(null);

  const locale = lang === "id" ? "id-ID" : "en-US";
  const uid = user?.uid;

  const loadDevices = React.useCallback(async () => {
    if (!uid) return;
    setDevicesLoading(true);
    try {
      await registerUserDeviceSession(uid, userProfile?.loginProvider ?? userProfile?.authMethod ?? "session");
      const rows = await getUserDeviceDocs(uid);
      setDeviceRows(mergeWithCurrentDevice(rows, uid));
    } catch {
      setDeviceRows([currentDeviceFallback(uid)]);
    } finally {
      setDevicesLoading(false);
    }
  }, [uid, userProfile?.loginProvider, userProfile?.authMethod]);

  const loadWallets = React.useCallback(async () => {
    if (!uid) return;
    setWalletsLoading(true);
    try {
      const docs = await getConnectedWalletDocs(uid);
      syncWalletProviderLocksFromFirestore(docs);
      setWalletRows(docs);
    } catch (err) {
      console.warn("[ToolsPanel] load wallets failed", err);
      setWalletRows([]);
    } finally {
      setWalletsLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    if (tool !== "devices") return;
    void loadDevices();
  }, [tool, loadDevices]);

  useEffect(() => {
    if (tool !== "wallets") return;
    void loadWallets();
  }, [tool, loadWallets, connectedWallet?.address, connectedWallet?.provider]);

  const mergedWalletRows = React.useMemo(() => {
    try {
      return mergeConnectedWalletRowsForDisplay(walletRows, {
        uid,
        profileAddress: userProfile?.walletAddress,
      }).filter((row) => /^0x/i.test(row.walletAddress?.trim() ?? ""));
    } catch (err) {
      console.warn("[ToolsPanel] merge wallet rows failed", err);
      return [];
    }
  }, [walletRows, uid, userProfile?.walletAddress]);

  useEffect(() => {
    if (tool !== "referral-dashboard") return;
    void refreshReferralStats();
  }, [tool, refreshReferralStats]);

  useEffect(() => {
    if (tool !== "transactions") return;
    void refreshWalletActivity({ force: true });
  }, [tool, refreshWalletActivity]);

  const header = (title: string, subtitle?: string, accent: HeaderAccent = "emerald") => {
    const a = HEADER_ACCENT[accent];
    return (
      <div className="gp-panel-header flex items-start gap-3 p-4 pt-6 shrink-0">
        <div className={`w-10 h-10 rounded-xl ${a.bg} border ${a.border} flex items-center justify-center ${a.text} shrink-0`}>
          {TOOL_ICONS[tool]}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="gp-text font-bold text-base leading-tight">{title}</h3>
          {subtitle && <p className="gp-muted text-xs mt-0.5 leading-snug">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} className="gp-muted gp-icon-btn p-1 shrink-0"><X className="w-4 h-4" /></button>
      </div>
    );
  };

  if (tool === "analytics") {
    const txVolume = transactions.reduce((sum, tx) => sum + Math.abs(parseUsd(tx.usd)), 0);
    const investedUsd = investPositions.reduce((sum, p) => sum + p.principalUsd, 0);
    const profitPct = investedUsd > 0 ? ((portfolioProfit / investedUsd) * 100).toFixed(1) : null;

    return (
      <div className="flex flex-col h-full">
        {header(tp.analyticsTitle, tp.analyticsSubtitle)}
        <div className="gp-panel-body p-4 space-y-3" style={{ scrollbarWidth: "none" }}>
          <ToolInfoBox info={tp.analyticsInfo} features={tg.analytics.features} tone="emerald" />
          <div className="rounded-2xl border gp-glass p-4">
            <p className="gp-muted text-[10px] uppercase tracking-widest mb-1">{tp.totalPortfolio}</p>
            <p className="gp-num gp-text text-2xl font-black">{formatUsd(portfolio)}</p>
            {profitPct != null && Number(profitPct) > 0 && (
              <div className="flex items-center gap-1.5 mt-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="gp-num text-emerald-400 text-xs font-semibold">+{profitPct}% ◈ invest</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: tp.txVolume, value: txVolume > 0 ? formatUsd(txVolume) : ", " },
              { label: tp.activeTokens, value: String(tokens.length) },
              { label: tp.invested, value: investedUsd > 0 ? formatUsd(investedUsd) : ", " },
              { label: tp.rewards, value: portfolioStakingReward > 0 ? `${portfolioStakingReward.toLocaleString()} GAT` : ", " },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border gp-subtle p-3">
                <p className="gp-muted text-[10px] mb-1">{s.label}</p>
                <p className="gp-num gp-text font-bold text-sm">{s.value}</p>
              </div>
            ))}
          </div>
          <p className="gp-muted text-[10px] leading-relaxed px-1">{tp.analyticsHint}</p>
        </div>
      </div>
    );
  }

  if (tool === "assets") {
    return (
      <div className="flex flex-col h-full">
        {header(tp.assetsTitle, tp.assetsSubtitle, "cyan")}
        <div className="gp-panel-body p-4 space-y-3" style={{ scrollbarWidth: "none" }}>
          <ToolInfoBox info={tp.assetsInfo} features={tg.assets?.features ?? []} tone="cyan" />
          <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/[0.06] p-4">
            <p className="gp-muted text-[10px] uppercase tracking-widest mb-1">{tp.assetsTotalLabel}</p>
            <p className="gp-num gp-text text-2xl font-black">{formatUsd(portfolio)}</p>
            <p className="gp-muted text-[10px] mt-1">{tokens.length} token ◈ Sidra Network</p>
          </div>
          <p className="gp-muted text-[10px] uppercase tracking-widest px-0.5">{tp.assetsHoldings}</p>
          {tokens.map((tok) => {
            const pct = portfolio > 0 ? Math.round((tok.usd / portfolio) * 100) : 0;
            return (
              <button
                key={tok.contractAddress ?? tok.symbol}
                type="button"
                onClick={() => openDetail({
                  kind: "token",
                  symbol: tok.symbol,
                  ...(tok.contractAddress ? { contractAddress: tok.contractAddress } : {}),
                })}
                className="w-full rounded-xl border gp-glass p-3 text-left gp-hover-row"
              >
                <div className="flex items-center gap-3 mb-2">
                  <TokenIcon symbol={tok.symbol} size="md" color={tok.color} logoUrl={tok.logoUrl} contractAddress={tok.contractAddress} />
                  <div className="flex-1 min-w-0">
                    <p className="gp-text text-sm font-semibold">{tok.symbol}</p>
                    <p className="gp-muted text-[10px] truncate">{tok.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="gp-num gp-text text-sm font-bold">{formatUsd(tok.usd)}</p>
                    <p className={`gp-num text-[10px] font-semibold ${tok.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {tok.change >= 0 ? "+" : ""}{tok.change}%
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="h-full rounded-full bg-cyan-400/80" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="gp-num gp-muted text-[10px] w-8 text-right">{pct}%</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (tool === "transactions") {
    const m = t.modals;
    const safeTransactions = sanitizeTransactionHistory(Array.isArray(transactions) ? transactions : []);
    const filters: { id: typeof txFilter; label: string }[] = [
      { id: "all", label: tp.txFilterAll },
      { id: "receive", label: tp.txFilterReceive },
      { id: "send", label: tp.txFilterSend },
      { id: "pay", label: tp.txFilterPay ?? m.txTypePay },
      { id: "invest", label: tp.txFilterInvest },
    ];
    const filtered = txFilter === "all"
      ? safeTransactions
      : safeTransactions.filter((tx) => (tx.type ?? "send").toLowerCase() === txFilter);
    const txIcon = (type: string) => txVisual(type).icon;
    const txBg = (type: string) => {
      const v = txVisual(type);
      const border = type.toLowerCase() === "receive" || type.toLowerCase() === "deposit"
        ? type.toLowerCase() === "deposit" ? "border-cyan-500/30" : "border-emerald-500/30"
        : type.toLowerCase() === "withdraw"
          ? "border-amber-500/30"
          : type.toLowerCase() === "invest"
            ? "border-amber-500/30"
            : "border-violet-500/30";
      return `${v.bg} ${border}`;
    };
    const groups = ACTIVITY_GROUP_ORDER.map((key) => ({
      key,
      label: key === "today" ? tp.txGroupToday : key === "yesterday" ? tp.txGroupYesterday : tp.txGroupEarlier,
    }));

    return (
      <div className="flex flex-col h-full">
        {header(tp.transactionsTitle, tp.transactionsSubtitle, "violet")}
        <div className="px-4 pt-3 pb-2 shrink-0 flex items-start justify-between gap-2">
          <p className="gp-muted text-[11px] leading-relaxed flex-1">{tp.transactionsInfo}</p>
          <button
            type="button"
            onClick={() => void refreshWalletActivity({ force: true })}
            className="shrink-0 p-2 rounded-xl gp-hover-row border gp-glass"
            aria-label={tp.txRefresh ?? "Refresh"}
            title={tp.txRefresh ?? "Refresh"}
          >
            <RefreshCw className="w-4 h-4 gp-muted" />
          </button>
        </div>
        <div className="px-4 pb-2 flex gap-1.5 shrink-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setTxFilter(f.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                txFilter === f.id
                  ? "bg-violet-500/20 text-violet-300 border border-violet-500/35"
                  : "gp-muted border border-transparent gp-hover-row"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="gp-panel-body px-4 pb-4" style={{ scrollbarWidth: "none" }}>
          {groups.map((group) => {
            const items = filtered.filter((tx) => activityTimeGroup(tx.time) === group.key);
            if (items.length === 0) return null;
            return (
              <div key={group.key} className="mb-4">
                <p className="gp-muted text-[10px] font-bold uppercase tracking-widest mb-2 px-1">{group.label}</p>
                <div className="relative pl-5 space-y-0">
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-violet-500/25" />
                  {items.map((tx) => {
                    const txType = tx.type ?? "send";
                    const typeLabel = resolveTxTypeLabel(txType, {
                      receive: m.txTypeReceive,
                      send: m.txTypeSend,
                      invest: m.txTypeInvest,
                      deposit: m.txTypeDeposit,
                      withdraw: m.txTypeWithdraw,
                      pay: m.txTypePay,
                      swap: m.txTypeSwap,
                    });
                    const amountText = tx.amount ?? ", ";
                    const statusText = tx.status ?? ", ";
                    const isConfirmedStatus = statusText.toLowerCase().includes("confirm")
                      || statusText.toLowerCase().includes("terkonfirmasi")
                      || statusText.toLowerCase().includes("sukses");
                    return (
                    <div key={tx.id} className="relative pb-3 last:pb-0">
                      <div className={`absolute left-0 top-3 w-[15px] h-[15px] rounded-full border-2 flex items-center justify-center ${txBg(txType)} bg-zinc-950 z-10`}>
                        <div className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openDetail({ kind: "transaction", id: tx.id });
                        }}
                        className="ml-3 w-[calc(100%-0.75rem)] rounded-xl border gp-glass p-3 text-left gp-hover-row transition-all active:scale-[0.99]"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${txBg(txType).split(" ")[0]}`}>
                            {txIcon(txType)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="gp-text text-xs font-bold truncate">{typeLabel}</p>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                                isConfirmedStatus ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                              }`}>
                                {statusText}
                              </span>
                            </div>
                            <p className="gp-muted gp-num text-[10px] truncate mt-0.5">{tx.addr ?? ", "}</p>
                            <p className="gp-muted text-[10px] mt-1">{formatTxDisplayTime(tx.time ?? "", lang)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`gp-num text-sm font-bold ${amountText.startsWith("+") ? "text-emerald-400" : "gp-text"}`}>{amountText}</p>
                            <p className="gp-muted gp-num text-[10px]">{formatTxUsdDisplay(tx)}</p>
                          </div>
                        </div>
                      </button>
                    </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="gp-muted text-xs text-center py-8">{tp.txEmptyFilter}</p>
          )}
        </div>
      </div>
    );
  }

  if (tool === "reports") {
    const periodScale = reportPeriod === "7d" ? 0.35 : reportPeriod === "90d" ? 1.4 : 1;
    const rows = transactions.slice(0, reportPeriod === "7d" ? 4 : reportPeriod === "90d" ? 8 : 6);
    const totalIn = rows.reduce((s, tx) => s + Math.max(0, parseUsd(tx.usd)), 0) * periodScale;
    const totalOut = rows.reduce((s, tx) => s + Math.abs(Math.min(0, parseUsd(tx.usd))), 0) * periodScale;
    const netFlow = totalIn - totalOut;
    const typeCounts = rows.reduce<Record<string, number>>((acc, tx) => {
      acc[tx.type] = (acc[tx.type] ?? 0) + 1;
      return acc;
    }, {});
    const maxCount = Math.max(...Object.values(typeCounts), 1);
    const typeLabels: Record<string, string> = {
      receive: tp.txFilterReceive,
      send: tp.txFilterSend,
      invest: tp.txFilterInvest,
    };
    const typeColors: Record<string, string> = {
      receive: "bg-emerald-400",
      send: "bg-orange-400",
      invest: "bg-amber-400",
    };

    return (
      <div className="flex flex-col h-full">
        {header(tp.reportsTitle, tp.reportsSubtitle, "orange")}
        <div className="px-4 pt-3 shrink-0">
          <ToolInfoBox info={tp.reportsInfo} features={tg.reports.features} tone="orange" />
        </div>
        <div className="px-4 py-2 flex gap-1.5 shrink-0">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setReportPeriod(p)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-semibold transition-all ${
                reportPeriod === p
                  ? "bg-orange-500/20 text-orange-300 border border-orange-500/35"
                  : "gp-muted border border-transparent gp-hover-row"
              }`}
            >
              <CalendarRange className="w-3 h-3" />
              {p === "7d" ? tp.reportsPeriod7d : p === "30d" ? tp.reportsPeriod30d : tp.reportsPeriod90d}
            </button>
          ))}
        </div>
        <div className="px-4 pb-2 grid grid-cols-2 gap-2 shrink-0">
          {[
            { label: tp.reportsTotalIn, value: formatUsd(totalIn), color: "text-emerald-400" },
            { label: tp.reportsTotalOut, value: formatUsd(totalOut), color: "text-red-400" },
            { label: tp.reportsNetFlow, value: formatUsd(netFlow), color: netFlow >= 0 ? "text-emerald-400" : "text-red-400" },
            { label: tp.reportsTxCount, value: String(Math.round(rows.length * periodScale)), color: "gp-text" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-orange-500/15 bg-orange-500/[0.04] p-2.5">
              <p className="gp-muted text-[9px] uppercase">{s.label}</p>
              <p className={`gp-num font-bold text-sm ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
        <div className="px-4 pb-2 shrink-0">
          <p className="gp-muted text-[9px] uppercase tracking-widest mb-1.5">{tp.reportsCategoryBreakdown}</p>
          <div className="rounded-xl border gp-glass p-3 space-y-2">
            {Object.entries(typeCounts).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2">
                <span className="gp-text text-[10px] w-12 capitalize shrink-0">{typeLabels[type] ?? type}</span>
                <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div className={`h-full rounded-full ${typeColors[type] ?? "bg-orange-400"}`} style={{ width: `${(count / maxCount) * 100}%` }} />
                </div>
                <span className="gp-num gp-muted text-[10px] w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="px-4 pb-2 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => showToast(tp.reportExported, "success")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-orange-500/30 text-orange-400 text-[11px] font-semibold gp-hover-row"
          >
            <Download className="w-3.5 h-3.5" /> {tp.exportCsv}
          </button>
          <button
            type="button"
            onClick={() => showToast(tp.reportPdfExported, "success")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-300 text-[11px] font-semibold gp-hover-row"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> {tp.reportsExportPdf}
          </button>
        </div>
        <div className="gp-panel-body px-4 pb-4 shrink min-h-0" style={{ scrollbarWidth: "none" }}>
          <div className="rounded-xl border border-orange-500/20 overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.7fr)] gap-1 px-2.5 py-2 bg-orange-500/10 border-b border-orange-500/15">
              {[tp.reportsColType, tp.reportsColCounterparty, tp.reportsColAmount, tp.reportsColStatus].map((col) => (
                <p key={col} className="gp-muted text-[8px] font-bold uppercase truncate">{col}</p>
              ))}
            </div>
            {rows.map((tx, idx) => (
              <div
                key={tx.id}
                className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.7fr)] gap-1 px-2.5 py-2 items-center ${
                  idx % 2 === 0 ? "bg-transparent" : "bg-orange-500/[0.03]"
                } ${idx < rows.length - 1 ? "border-b gp-divider" : ""}`}
              >
                <p className="gp-text text-[10px] font-semibold capitalize truncate">{tx.type}</p>
                <p className="gp-muted gp-num text-[9px] truncate">{tx.addr}</p>
                <p className={`gp-num text-[10px] font-bold truncate ${(tx.amount ?? "").startsWith("+") ? "text-emerald-400" : "gp-text"}`}>{tx.amount ?? ", "}</p>
                <p className="gp-muted text-[9px] truncate">{tx.status}</p>
              </div>
            ))}
          </div>
          <p className="gp-muted text-[10px] leading-relaxed mt-3 px-1">{tp.reportsAuditNote}</p>
        </div>
      </div>
    );
  }

  if (tool === "devices") {
    const handleRemoveDevice = async (row: UserDeviceDoc) => {
      if (!uid) return;
      if (isCurrentDeviceSession(row)) {
        await signOut();
        showToast(tp.deviceRevokeCurrent, "warning");
        onClose();
        return;
      }
      setDeviceBusyId(row.id);
      try {
        await deleteUserDeviceDoc(uid, row.id);
        setDeviceRows((prev) => prev.filter((d) => d.id !== row.id));
        showToast(tp.deviceDeleted, "success");
      } catch {
        showToast(t.toast.authFailed as string, "error");
      } finally {
        setDeviceBusyId(null);
      }
    };

    return (
      <div className="flex flex-col h-full">
        {header(tp.devicesTitle, tp.devicesSubtitle, "sky")}
        <div className="gp-panel-body p-4 space-y-2" style={{ scrollbarWidth: "none" }}>
          <ToolInfoBox info={tp.devicesInfo} features={tg.devices.features} tone="sky" />
          {devicesLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
            </div>
          ) : deviceRows.length ? (
            deviceRows.map((row) => {
              const isCurrent = isCurrentDeviceSession(row);
              const lastSeen = formatActivityTimestamp(row.lastSeen ?? row.firstSeen, locale);
              return (
                <div key={row.id} className="rounded-xl border gp-glass p-3 flex items-center gap-3">
                  <span className="text-emerald-400 shrink-0"><Smartphone className="w-4 h-4" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="gp-text text-sm font-semibold truncate">{row.device}</p>
                    <p className="gp-muted text-[10px] truncate">
                      {isCurrent ? tp.deviceCurrent : row.browser}
                    </p>
                    {lastSeen && (
                      <p className="gp-muted text-[10px] mt-0.5">
                        {tp.deviceLastSeen}: {lastSeen}
                      </p>
                    )}
                    {row.location && row.location !== "Unknown" && (
                      <p className="gp-muted text-[10px] truncate">{row.location}</p>
                    )}
                  </div>
                  {isCurrent ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 shrink-0">
                      {tp.thisDevice}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    disabled={deviceBusyId === row.id}
                    onClick={() => void handleRemoveDevice(row)}
                    aria-label={isCurrent ? tp.deviceRevokeCurrent : tp.delete}
                    className="shrink-0 p-2 rounded-lg border border-red-500/25 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {deviceBusyId === row.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              );
            })
          ) : (
            <p className="gp-muted text-xs text-center py-6">{tp.devicesEmpty}</p>
          )}
        </div>
      </div>
    );
  }

  if (tool === "wallets") {
    const primaryAddress = resolvePrimaryWalletAddress(
      userProfile?.walletAddress,
      walletAddress,
    );

    const handleSetPrimary = async (row: ConnectedWalletDoc) => {
      if (!/^0x/i.test(row.walletAddress?.trim() ?? "")) return;
      setPrimaryBusyId(row.id);
      const rowKey = row.walletAddress.toLowerCase();
      const firestoreRow = walletRows.find((r) => r.walletAddress.toLowerCase() === rowKey);
      try {
        const docId = firestoreRow?.id ?? row.id;
        await setPrimaryWeb3Wallet(row.walletAddress, {
          walletType: firestoreRow?.walletType ?? row.walletType,
          network: firestoreRow?.network ?? row.network,
          docId: docId && !["profile_wallet", "local_wallet"].includes(docId) ? docId : undefined,
        });
        await refreshUserProfile();
        void loadWallets();
        showToast(tp.primaryWalletUpdated, "success");
      } catch (err) {
        const key = walletErrorKey(err);
        const msg = (t.toast as Record<string, string | undefined>)[key]
          ?? (err instanceof Error ? err.message : null)
          ?? (t.wallet.switchWalletFailed ?? "Gagal mengganti dompet");
        showToast(msg, "error");
      } finally {
        setPrimaryBusyId(null);
      }
    };

    const handleRemoveWallet = async (row: ConnectedWalletDoc) => {
      if (!/^0x/i.test(row.walletAddress?.trim() ?? "")) return;
      const normalized = row.walletAddress.toLowerCase();
      const isSynthetic = row.id === "local_wallet" || row.id === "profile_wallet";
      const docId = isSynthetic ? undefined : row.id;
      setWalletBusyId(row.id);
      try {
        await disconnectWeb3Wallet(row.walletAddress, docId);
        setWalletRows((prev) => prev.filter((w) => w.walletAddress.toLowerCase() !== normalized));
        await refreshUserProfile();
        try {
          await loadWallets();
        } catch {
          /* keep optimistic row removal */
        }
        showToast(
          normalized === primaryAddress ? tp.walletDeletePrimary : tp.walletRemoved,
          "success",
        );
      } catch {
        showToast(tp.walletRemoveFailed ?? t.toast.authFailed as string, "error");
      } finally {
        setWalletBusyId(null);
      }
    };

    const validWalletRows = mergedWalletRows.filter((row) => /^0x/i.test(row.walletAddress?.trim() ?? ""));

    return (
      <>
        <GarudaProcessOverlay
          active={Boolean(primaryBusyId)}
          message={t.wallet.activatingWallet ?? "Mengaktifkan dompet…"}
          submessage={t.wallet.activatingWalletHint ?? "Menyimpan pilihan dompet utama"}
        />
        <div className="flex flex-col h-full">
          {header(tp.walletsTitle, tp.walletsSubtitle, "teal")}
          <div className="gp-panel-body p-4 space-y-2" style={{ scrollbarWidth: "none" }}>
            <ToolInfoBox info={tg.wallets.info} features={tg.wallets.features} tone="teal" />
            <PanelErrorBoundary title="Dompet terhubung gagal dimuat" onRetry={() => void loadWallets()}>
            {walletsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
              </div>
            ) : validWalletRows.length ? (
              validWalletRows.map((row) => {
                const rowKey = row.walletAddress.toLowerCase();
                const isPrimary = rowKey === primaryAddress;
                const providerLabel = resolveWalletDisplayLabel(row, connectedWallet);
                const display = resolveWalletRowDisplay(row, lang === "id" ? "id" : "en", connectedWallet);
                const effective = resolveFirestoreWalletProvider(row);
                const isGaruda = effective === "embedded:garuda";
                const isMetaMask = effective === "metamask";
                const cardBorder = isGaruda
                  ? "border-emerald-500/35"
                  : isMetaMask
                    ? "border-orange-500/35"
                    : "border-sky-500/25";
                const iconWrap = isGaruda
                  ? "bg-emerald-500/15 text-emerald-400"
                  : isMetaMask
                    ? "bg-orange-500/15 text-orange-400"
                    : "bg-sky-500/15 text-sky-400";
                return (
                  <div key={`${rowKey}-${row.id}`} className={`rounded-xl border gp-glass p-3 ${cardBorder}`}>
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <span className="flex items-center gap-2 gp-text text-sm font-semibold min-w-0">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconWrap}`}>
                          <Wallet className="w-3.5 h-3.5" />
                        </span>
                        <span className="truncate">{display.kindLabel}</span>
                        {display.badge && (
                          <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${
                            display.badge === "Resmi" || display.badge === "Official"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-sky-500/15 text-sky-400"
                          }`}>
                            {display.badge}
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {isPrimary && (
                          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                            {tp.primary}
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={walletBusyId === row.id}
                          onClick={() => void handleRemoveWallet(row)}
                          aria-label={tp.delete}
                          className="p-1.5 rounded-lg border border-red-500/25 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {walletBusyId === row.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <p className="gp-num gp-text text-xs break-all mb-1">{formatWalletAddressShort(row.walletAddress)}</p>
                    <p className="gp-muted text-[10px] mb-1">{providerLabel} / {row.network}</p>
                    <p className="gp-muted text-[9px] mb-2 leading-snug opacity-80">{display.detailLabel}</p>
                    <ConnectedWalletBalance
                      address={row.walletAddress}
                      balanceLabel={tp.walletOnChainBalance ?? "Saldo on-chain"}
                      loadingLabel={tp.walletBalanceLoading ?? "Memuat saldo…"}
                      hideSda={shouldHideConnectedWalletSdaBalance(row.walletAddress, row.walletType)}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyText(row.walletAddress, providerLabel)}
                        className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-semibold"
                      >
                        <Copy className="w-3 h-3" /> {t.common.copy}
                      </button>
                      {!isPrimary && (
                        <button
                          type="button"
                          disabled={primaryBusyId === row.id}
                          onClick={() => void handleSetPrimary(row)}
                          className="flex items-center gap-1.5 text-amber-400 text-[11px] font-semibold disabled:opacity-50"
                        >
                          {primaryBusyId === row.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Star className="w-3 h-3" />}
                          {tp.setPrimaryWallet}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="gp-muted text-xs text-center py-6">{tp.walletsEmpty}</p>
            )}
            </PanelErrorBoundary>
            <button
              type="button"
              disabled={!uid}
              onClick={() => {
                if (!uid) {
                  showToast(t.toast.authFailed as string, "error");
                  return;
                }
                setWalletModalOpen(true);
              }}
              className="w-full py-3 rounded-xl border border-dashed border-emerald-500/30 text-emerald-400 text-sm font-semibold mt-2 gp-hover-row disabled:opacity-50"
            >
              + {validWalletRows.length ? tp.connectAnotherWallet : tp.connectWallet}
            </button>
          </div>
        </div>
        <WalletConnectModal
          open={walletModalOpen}
          onClose={() => {
            setWalletModalOpen(false);
            void loadWallets();
          }}
          mode="connect"
          onConnected={() => {
            void refreshUserProfile();
            void loadWallets();
            setWalletModalOpen(false);
          }}
        />
      </>
    );
  }

  if (tool === "referral-dashboard") {
    const usageEnabled = isReferralUsageEnabled(referralConfig);
    const stats = referralStats;
    const referralHistory = (stats?.history ?? []).map((row) => ({
      name: row.name,
      status: row.status === "completed" ? tp.referralStatusCompleted : row.status === "pending" ? tp.referralStatusPending : tp.referralStatusRegistered,
      date: row.date ? new Date(row.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ", ",
      reward: row.rewardGat > 0 ? `${row.rewardGat} GAT` : ", ",
      done: row.status === "completed",
    }));
    const monthly = [{ month: "Earned", gat: stats?.totalEarnedGat ?? 0 }];
    const maxGat = Math.max(monthly[0]!.gat, 1);

    return (
      <div className="flex flex-col h-full">
        {header(tp.referralDashboardTitle, tp.referralDashboardSubtitle, "fuchsia")}
        <div className="gp-panel-body p-4 space-y-3" style={{ scrollbarWidth: "none" }}>
          {!usageEnabled && (
            <ReferralLockedNotice
              title={t.community.referralLockedTitle}
              compact
            />
          )}
          <ToolInfoBox info={tp.referralDashboardInfo} features={tg.referral?.features ?? []} tone="fuchsia" />
          <div className="rounded-xl border gp-glass p-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="gp-muted text-[9px] uppercase">{t.common.referralCode}</p>
              <p className={`gp-num gp-text text-xs font-bold truncate ${!usageEnabled ? "opacity-50" : ""}`}>{stats?.referralCode ?? referralCode}</p>
            </div>
            <button
              type="button"
              disabled={!usageEnabled}
              onClick={() => usageEnabled
                ? copyText(referralCode, t.common.referralCode)
                : showToast(t.community.referralLockedActionToast, "warning")}
              className="text-fuchsia-400 text-[10px] font-semibold flex items-center gap-1 shrink-0 disabled:opacity-40"
            >
              <Copy className="w-3 h-3" /> {t.common.copy}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: tp.referralTotalReferred, value: String(stats?.totalReferred ?? 0), color: "text-fuchsia-300" },
              { label: tp.referralTotalEarned, value: `${stats?.totalEarnedGat ?? 0} GAT`, color: "text-emerald-400" },
              { label: tp.referralPending, value: `${stats?.pendingRewardGat ?? 0} GAT`, color: "text-amber-400" },
              { label: tp.referralConversion, value: `${stats?.conversionPct ?? 0}%`, color: "gp-text" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-fuchsia-500/15 bg-fuchsia-500/[0.04] p-2.5">
                <p className="gp-muted text-[9px] uppercase">{s.label}</p>
                <p className={`gp-num font-bold text-sm ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="gp-muted text-[9px] uppercase tracking-widest mb-1.5 px-0.5">{tp.referralMonthlyEarnings}</p>
            <div className="rounded-xl border gp-glass p-3 flex items-end gap-2 h-24">
              {monthly.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end justify-center flex-1">
                    <div
                      className="w-full max-w-[28px] rounded-t-md bg-gradient-to-t from-fuchsia-600/80 to-fuchsia-400/60"
                      style={{ height: `${(m.gat / maxGat) * 100}%`, minHeight: 4 }}
                    />
                  </div>
                  <span className="gp-muted text-[9px]">{m.month}</span>
                  <span className="gp-num text-[9px] text-fuchsia-300">{m.gat}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="gp-muted text-[9px] uppercase tracking-widest mb-1.5 px-0.5">{tp.referralHistoryTitle}</p>
            <div className="rounded-xl border border-fuchsia-500/20 overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.6fr)] gap-1 px-2.5 py-2 bg-fuchsia-500/10 border-b border-fuchsia-500/15">
                {[tp.referralColName, tp.referralColStatus, tp.referralColDate, tp.referralColReward].map((col) => (
                  <p key={col} className="gp-muted text-[8px] font-bold uppercase truncate">{col}</p>
                ))}
              </div>
              {referralHistory.length === 0 ? (
                <p className="gp-muted text-[10px] p-3 text-center">Belum ada referral, bagikan kode Anda.</p>
              ) : referralHistory.map((row, idx) => (
                <div
                  key={row.name + row.date}
                  className={`grid grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.6fr)] gap-1 px-2.5 py-2 items-center ${
                    idx % 2 === 0 ? "bg-transparent" : "bg-fuchsia-500/[0.03]"
                  } ${idx < referralHistory.length - 1 ? "border-b gp-divider" : ""}`}
                >
                  <p className="gp-text text-[10px] font-semibold truncate">{row.name}</p>
                  <p className={`text-[9px] truncate ${row.done ? "text-emerald-400" : "text-amber-400"}`}>{row.status}</p>
                  <p className="gp-muted text-[9px] truncate">{row.date}</p>
                  <p className={`gp-num text-[10px] font-bold truncate ${row.done ? "text-emerald-400" : "gp-muted"}`}>{row.reward}</p>
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { onClose(); openCommunity("referral"); }}
            className="w-full py-3 rounded-xl border border-emerald-500/30 text-emerald-400 text-sm font-semibold flex items-center justify-center gap-2 gp-hover-row"
          >
            <Gift className="w-4 h-4" /> {tp.referralOpenProgram}
          </button>
        </div>
      </div>
    );
  }

  if (tool === "merchant") {
    return <MerchantCenterPanel onClose={onClose} initialTab={merchantPanelTab} />;
  }

  if (tool === "my-orders") {
    return <BuyerOrdersPanel onClose={onClose} />;
  }

  // help
  return (
    <div className="flex flex-col h-full">
      {header(tp.helpTitle, tp.helpSubtitle, "indigo")}
      <div className="gp-panel-body p-4 space-y-2" style={{ scrollbarWidth: "none" }}>
        <ToolInfoBox info={tp.helpInfo} features={tg.help.features} tone="indigo" />
        {tp.faq.map((item, idx) => (
          <div key={item.q} className="rounded-xl border gp-glass overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
              className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left"
            >
              <span className="gp-text text-sm font-medium leading-snug">{item.q}</span>
              {openFaq === idx ? <ChevronUp className="w-4 h-4 gp-muted shrink-0" /> : <ChevronDown className="w-4 h-4 gp-muted shrink-0" />}
            </button>
            {openFaq === idx && (
              <p className="gp-muted text-xs leading-relaxed px-3 pb-3 border-t gp-divider pt-2">{item.a}</p>
            )}
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            type="button"
            onClick={() => showToast(tp.chatOpened, "info")}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border gp-glass text-sm font-semibold gp-text"
          >
            <MessageCircle className="w-4 h-4 text-emerald-400" /> {tp.liveChat}
          </button>
          <button
            type="button"
            onClick={() => showToast(tp.emailSent, "info")}
            className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border gp-glass text-sm font-semibold gp-text"
          >
            <Mail className="w-4 h-4 text-cyan-400" />
            <span className="text-[11px]">{tp.emailSupport}</span>
          </button>
        </div>
        <div className="gp-callout gp-callout--emerald mt-1">
          <CheckCircle className="gp-callout__icon w-4 h-4 shrink-0" strokeWidth={2} />
          <p className="gp-callout__text">{tp.supportHours}</p>
        </div>
      </div>
    </div>
  );
};
