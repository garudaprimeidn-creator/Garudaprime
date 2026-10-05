import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GP_SEP_INLINE } from "./garudaUi";
import {
  Home, Wallet, TrendingUp, ShoppingBag, Users,
  Bell, Search, Settings, ChevronRight, ArrowUpRight,
  ArrowDownLeft, Send, QrCode, Repeat2, Shield,
  Eye, EyeOff, X, Menu, Bot, BarChart3, Activity,
  UserCircle, HelpCircle, Gift, BookOpen,
  CheckCircle, AlertCircle, Plus, ArrowRight, Copy,
  ChevronLeft, Building2, Sprout, Store, Handshake,
  Target, Calculator, Lock, RefreshCw,
  ExternalLink, Key, Smartphone, PieChart, FileText,
  ChevronDown, Zap, Globe, CreditCard, Award,
  Heart, Fingerprint, Download, Layers,   Crown,   Share2,
  ArrowUpFromLine,   Vote, Rocket,
  Megaphone, Link2, Trash2, CheckCheck,
  ShieldCheck, Clock, ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer,
  Tooltip, PieChart as RPieChart, Pie, Cell,
} from "recharts";
import { useAuth } from "../contexts/AuthContext";
import { resolveTransactionWalletProvider, resolveOnChainBalanceAddress, resolveWalletMoneyAddress } from "../lib/web3/connectedWalletUtils";
import { autoActivateGarudaPrimeWallet } from "../lib/web3/garudaNativeProvision";
import { encodeReceiveQrPayload } from "../lib/qr/parseQrPayload";
import { warmQrImageCache } from "../lib/qr/qrImageCache";
import { canonicalMerchantIdForOwner } from "../lib/merchant/merchantService";
import { AppProvider, useApp } from "./AppContext";
import { sendGarudaAiMessage } from "../lib/ai/aiChatService";
import { buildInitialAiGreeting } from "../lib/ai/aiChatRules";
import { AppFlow } from "../features/flow/AppFlow";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { SecurityOverlays } from "../features/security/SecurityOverlays";
import { useLanguage } from "./LanguageContext";
import { ProfilePanel } from "./ProfilePanel";
import { ProfileAvatar } from "./ProfileAvatar";
import { WalletSwitcher } from "../features/wallet/WalletSwitcher";
import {
  LazyCommunityScreen,
  LazySidraChainPanel,
  LazyGovernancePanel,
  LazyInvestScreen,
  LazyMainnetMigrationPanel,
  LazyMarketScreen,
  LazyNftIdentityPanel,
  LazyToolsPanel,
} from "./lazyScreens";
import { isPhase4Active, isGovernanceEnabled, isMainnetMigrationOpen } from "../lib/ecosystem/garudaEcosystem";
import { isReferralProgramVisible } from "../lib/referral/referralProgramGate";
import { fetchSidraStats } from "../lib/web3/sidraExplorer";
import { fetchUtilityNftPortfolio } from "../lib/nft/utilityNftService";
import { TokenIcon } from "./TokenIcon";
import { WalletHoldingsList } from "./WalletHoldingsList";
import { PortfolioMix } from "./PortfolioMix";
import { WalletTokenRow } from "./WalletTokenRow";
import { withFundIcons } from "./investFundIcons";
import { formatNotifTime } from "../lib/notifications/notificationService";
import { activityTimeGroup, ACTIVITY_GROUP_ORDER } from "../lib/user/activityTimeGroup";
import { buildAllocationFromHoldings, buildPortfolioChart } from "../lib/user/portfolioDisplay";
import { CORE_WALLET_SYMBOLS, displayTokenSymbol } from "./tokenEconomy";
import { showAppToast } from "./appToast";
import {
  TokenDetailModal, FundDetailModal,
  ProductDetailModal, InvestModal,
  TransactionDetailModal,
} from "./AppModals";
import {
  LazyPayModal,
  LazyReceiveModal,
  LazyScanModal,
  LazySendModal,
  LazySwapModal,
} from "./lazyWalletModals";
import { TransactionRow } from "./TransactionRow";
import { PanelErrorBoundary } from "./PanelErrorBoundary";
import { AddCustomTokenModal } from "./AddCustomTokenModal";
import { BootDataLoader } from "./BootDataLoader";
import { clearBootBlockers } from "../lib/app/bootCleanup";
import { isKycPortCallbackPath } from "../lib/kyc/kycportCallbackParams";
import { KycPortCallbackScreen } from "../features/kyc/KycPortCallbackScreen";
import { usePullToRefresh } from "./usePullToRefresh";
import { APP_NAME } from "../lib/app/branding";

// ─── Types ─────────────────────────────────────────────────────────────────

const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const SIDEBAR_ITEMS = [
  { icon: <Home className="w-4 h-4" />, labelKey: "dashboard" as const, screen: "home" as Screen },
  { icon: <Wallet className="w-4 h-4" />, labelKey: "wallet" as const, screen: "wallet" as Screen },
  { icon: <TrendingUp className="w-4 h-4" />, labelKey: "investment" as const, screen: "invest" as Screen },
  { icon: <ShoppingBag className="w-4 h-4" />, labelKey: "marketplace" as const, screen: "market" as Screen },
  { icon: <Users className="w-4 h-4" />, labelKey: "community" as const, screen: "community" as Screen },
];

// ─── Utility Components ──────────────────────────────────────────────────────

const GlassCard = ({
  children, className = "", onClick,
}: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
  <div
    className={`gp-glass backdrop-blur-xl border rounded-2xl ${
      onClick ? "cursor-pointer active:scale-[0.98] transition-transform" : ""
    } ${className}`}
    onClick={onClick}
  >
    {children}
  </div>
);

const EmeraldBtn = ({
  children, onClick, className = "", variant = "solid", size = "md",
}: {
  children: React.ReactNode; onClick?: () => void;
  className?: string; variant?: "solid" | "outline" | "ghost"; size?: "sm" | "md" | "lg";
}) => {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 active:scale-[0.97]";
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2.5 text-sm", lg: "px-5 py-3.5 text-base" };
  const variants = {
    solid: "bg-gradient-to-r from-emerald-500 to-teal-400 text-black hover:from-emerald-400 hover:to-teal-300 shadow-lg shadow-emerald-500/20",
    outline: "border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10",
    ghost: "text-emerald-400 hover:bg-emerald-500/10",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} onClick={onClick}>
      {children}
    </button>
  );
};

const SyariahBadge = ({ className = "" }: { className?: string }) => {
  const { t } = useLanguage();
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold tracking-wide ${className}`}>
      <CheckCircle className="w-2.5 h-2.5" /> {t.syariah}
    </span>
  );
};

const GoldBadge = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-semibold">
    {children}
  </span>
);

const NetworkDot = ({ active = true }: { active?: boolean }) => (
  <span className={`inline-block w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-400 shadow-sm shadow-emerald-400/60" : "bg-slate-500"}`} />
);

type KycStatusTone = "verified" | "pending" | "rejected" | "limited";

const getKycStatusDisplay = (
  isKycVerified: boolean,
  isKycPending: boolean,
  isKycRejected: boolean,
  labels: { kycFull: string; kycPending: string; kycRejected: string; kycLimited: string },
) => {
  const label = isKycVerified
    ? labels.kycFull
    : isKycPending
      ? labels.kycPending
      : isKycRejected
        ? labels.kycRejected
        : labels.kycLimited;
  const tone: KycStatusTone = isKycVerified
    ? "verified"
    : isKycPending
      ? "pending"
      : isKycRejected
        ? "rejected"
        : "limited";
  return { label, tone };
};

const KycStatusBadge = ({
  label,
  tone,
  compact = false,
}: {
  label: string;
  tone: KycStatusTone;
  compact?: boolean;
}) => {
  const icon = {
    verified: ShieldCheck,
    pending: Clock,
    rejected: ShieldAlert,
    limited: Shield,
  }[tone];
  const Icon = icon;
  return (
    <span className={`gp-kyc-badge gp-kyc-badge--${tone}${compact ? " gp-kyc-badge--compact" : ""}`}>
      <Icon className="gp-kyc-badge__icon" strokeWidth={2.25} aria-hidden />
      {!compact && <span className="gp-kyc-badge__dot" aria-hidden />}
      <span className="gp-kyc-badge__label">{label}</span>
    </span>
  );
};

// ─── Custom Recharts Tooltip ──────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="backdrop-blur-xl gp-glass border rounded-xl px-3 py-2 shadow-lg">
      <p className="gp-muted text-xs mb-0.5">{label}</p>
      <p className="text-emerald-400 gp-num font-bold text-sm">${payload[0].value.toLocaleString()}</p>
    </div>
  );
};

// ─── Mobile Shell ─────────────────────────────────────────────────────────────
const MobileShell = ({ children }: { children: React.ReactNode }) => (
  <div className="gp-shell-outer flex items-stretch sm:items-center justify-center sm:p-6">
    <div
      className="gp-phone-frame relative w-full h-[100dvh] max-h-[100dvh] sm:max-w-[430px] sm:h-[min(932px,100dvh)] sm:max-h-[min(932px,100dvh)] sm:rounded-[2rem] sm:border overflow-hidden flex flex-col"
    >
      {children}
    </div>
  </div>
);

// ─── Home Screen ──────────────────────────────────────────────────────────────
const HomeScreen = () => {
  const {
    requestOverlay, toggleOverlay, openDetail, setScreen, transactions, openScan,
    profileName, tokens, portfolioUsd, portfolioProfit,
  } = useApp();
  const { t } = useLanguage();
  const c = t.common;
  const [chainBlock, setChainBlock] = useState<string>(", ");

  useEffect(() => {
    void fetchSidraStats().then((stats) => {
      if (stats?.totalBlocks) setChainBlock(stats.totalBlocks);
    });
    const onAppRefresh = () => {
      void fetchSidraStats().then((stats) => {
        if (stats?.totalBlocks) setChainBlock(stats.totalBlocks);
      });
    };
    window.addEventListener("gp-app-refresh", onAppRefresh);
    return () => window.removeEventListener("gp-app-refresh", onAppRefresh);
  }, []);

  const gatToken = tokens.find((tok) => tok.symbol === "GAT");
  const portfolioChart = buildPortfolioChart(portfolioUsd, gatToken?.usd ?? 0);
  const hasPortfolio = portfolioUsd > 0;

  const quickActions = [
    { icon: <Send className="w-4 h-4" />, label: c.send, action: () => requestOverlay("send") },
    { icon: <ArrowDownLeft className="w-4 h-4" />, label: c.receive, action: () => toggleOverlay("receive") },
    { icon: <Repeat2 className="w-4 h-4" />, label: c.swap, action: () => requestOverlay("swap") },
    { icon: <QrCode className="w-4 h-4" />, label: c.pay, action: () => openScan("pay") },
  ];

  return (
  <div className="space-y-4">
    <div className="gp-greeting-wrap">
      <ProfileAvatar size="sm" rounded="full" />
      <div className="gp-greeting-classic flex-1">
        <p className="gp-greeting-salam">{t.home.salam}</p>
        <h1 className="gp-greeting-name truncate">{profileName}</h1>
        <p className="gp-greeting-tier">{t.home.greetingSubtitle}</p>
      </div>
    </div>

    {/* Portfolio Hero */}
    <div className="gp-hero gp-hero-home relative rounded-2xl overflow-hidden p-5">
      <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl -translate-y-16 translate-x-16 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-amber-500/8 rounded-full blur-2xl pointer-events-none" />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="gp-muted text-xs tracking-wider uppercase mb-1">{t.home.totalPortfolio}</p>
            <h2 className="gp-num text-4xl font-black gp-text tracking-tight">
              {formatUsd(portfolioUsd)}
            </h2>
            <div className="flex items-center gap-1.5 mt-1">
              {hasPortfolio && portfolioProfit > 0 ? (
                <>
                  <span className="gp-num text-emerald-400 text-sm font-semibold">+{formatUsd(portfolioProfit)}</span>
                  <span className="gp-num text-emerald-400/70 text-xs">({t.today})</span>
                </>
              ) : (
                <span className="gp-muted text-xs">{t.home.portfolioEmptyHint}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <SyariahBadge />
            <GoldBadge>
              <Crown className="w-2.5 h-2.5 fill-amber-400" /> {t.prime}
            </GoldBadge>
          </div>
        </div>
        {/* Mini chart */}
        <div className="h-20 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={portfolioChart}>
              <defs>
                <linearGradient id="hGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0dca82" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0dca82" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value" stroke="#0dca82" strokeWidth={2} fill="url(#hGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {/* Quick actions */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {quickActions.map((a) => (
            <button
              key={a.label} onClick={a.action}
              className="gp-hero-action flex flex-col items-center gap-1.5 py-2.5 rounded-xl transition-all active:scale-95"
            >
              <span className="text-emerald-400">{a.icon}</span>
              <span className="gp-text text-[10px] font-medium">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>

    {/* AI Insight */}
    <GlassCard className="gp-hero-ai p-4 border-amber-500/20 cursor-pointer hover:border-amber-500/35 transition-all" onClick={() => toggleOverlay("ai")}>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/25">
          <Bot className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <p className="gp-text font-semibold text-sm">{t.home.aiInsight}</p>
            <span className="gp-muted text-[10px]">{t.home.updatedAgo}</span>
          </div>
          <p className="gp-muted text-xs leading-relaxed">
            {t.home.aiBody}{" "}
            <span className="text-amber-400 font-medium">{t.home.aiFund}</span> {t.home.aiBodyEnd}
          </p>
        </div>
      </div>
    </GlassCard>

    {/* Token Balances */}
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="gp-text font-semibold text-sm">{t.home.yourAssets}</h3>
        <button onClick={() => setScreen("wallet")} className="text-emerald-400 text-xs flex items-center gap-1 hover:text-emerald-300">
          {t.home.allAssets} <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      <div className="space-y-2">
        {tokens.map((tok) => (
          <GlassCard
            key={tok.contractAddress ?? tok.symbol}
            className="p-3.5 flex items-center gap-3 cursor-pointer gp-hover-row transition-all"
            onClick={() => openDetail({
              kind: "token",
              symbol: tok.symbol,
              ...(tok.contractAddress ? { contractAddress: tok.contractAddress } : {}),
            })}
          >
            <TokenIcon symbol={tok.symbol} size="md" color={tok.color} logoUrl={tok.logoUrl} contractAddress={tok.contractAddress} />
            <div className="flex-1 min-w-0">
              <p className="gp-text text-sm font-semibold">{displayTokenSymbol(tok.symbol)}</p>
              <p className="gp-muted text-[11px] truncate">{tok.name}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="gp-text text-sm gp-num font-medium">${tok.usd.toLocaleString()}</p>
              <p className={`text-[11px] gp-num ${tok.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {tok.change >= 0 ? "+" : ""}{tok.change}%
              </p>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>

    {/* Recent Transactions */}
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="gp-text font-semibold text-sm">{t.home.recentActivity}</h3>
        <button onClick={() => setScreen("wallet")} className="text-emerald-400 text-xs flex items-center gap-1 hover:text-emerald-300">
          {t.seeAll} <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      <div className="space-y-2">
        {transactions.length === 0 ? (
          <GlassCard className="p-4 text-center">
            <p className="gp-muted text-xs">{t.home.noActivity}</p>
          </GlassCard>
        ) : transactions.slice(0, 4).map((tx) => (
          <TransactionRow
            key={tx.id}
            tx={tx}
            onClick={() => openDetail({ kind: "transaction", id: tx.id })}
          />
        ))}
      </div>
    </div>

    {/* Network Status */}
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
            <Globe className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <p className="gp-text text-sm font-semibold">{t.home.network}</p>
            <p className="gp-muted text-[11px]">{t.home.networkSub}</p>
            <p className="gp-muted text-[10px] gp-num mt-0.5">{t.home.block} #{chainBlock}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <NetworkDot />
          <span className="text-emerald-400 text-xs font-medium">{t.active}</span>
        </div>
      </div>
    </GlassCard>
  </div>
  );
};

const WALLET_TOKEN_ORDER = CORE_WALLET_SYMBOLS;

const sortWalletTokens = <T extends { symbol: string }>(list: T[]): T[] =>
  [...list].sort((a, b) => {
    const ai = WALLET_TOKEN_ORDER.indexOf(a.symbol as typeof WALLET_TOKEN_ORDER[number]);
    const bi = WALLET_TOKEN_ORDER.indexOf(b.symbol as typeof WALLET_TOKEN_ORDER[number]);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.symbol.localeCompare(b.symbol);
  });

// ─── Wallet Screen ────────────────────────────────────────────────────────────
const WalletScreen = () => {
  const {
    requestOverlay, requestSendOverlay, toggleOverlay, openDetail, copyText, shareWalletAddress, showToast,
    walletAddress, transactions, openScan, tokens, portfolioUsd, portfolioProfit,
    refreshBalances, balancesLoading, investPositions,
  } = useApp();
  const { t, lang } = useLanguage();
  const c = t.common;
  const w = t.wallet;
  const wa = t.walletActions;
  const [hideBalance, setHideBalance] = useState(false);
  const [activeNet, setActiveNet] = useState<"SDA" | "ETH" | "ALL">("SDA");
  const [nftOwnedCount, setNftOwnedCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchUtilityNftPortfolio(lang === "en" ? "en" : "id").then((p) => {
      if (!cancelled) setNftOwnedCount(p?.owned ?? 0);
    });
    return () => { cancelled = true; };
  }, [lang]);

  const safeTokens = Array.isArray(tokens) ? tokens : [];
  const safeInvestPositions = Array.isArray(investPositions) ? investPositions : [];

  const allocation = buildAllocationFromHoldings(
    Object.fromEntries(safeTokens.filter((tok) => !tok.custom).map((tok) => [tok.symbol, tok.balance])),
    safeInvestPositions.reduce((sum, p) => sum + (Number(p.principalUsd) || 0), 0),
  );

  const shareAddress = async () => {
    const text = wa.shareAddressText.replace("{address}", walletAddress);
    const result = await shareWalletAddress(text, wa.shareAddress);
    if (result === "shared") showToast(wa.shareSuccess, "success");
    else if (result === "copied") showToast(wa.shareCopiedFallback, "success");
    else showToast(wa.shareFailed, "error");
  };

  const walletActions: {
    icon: LucideIcon;
    tone: "send" | "receive" | "swap" | "scan";
    label: string;
    action: () => void;
  }[] = [
    { icon: Send, tone: "send", label: c.send, action: () => requestSendOverlay() },
    { icon: ArrowDownLeft, tone: "receive", label: c.receive, action: () => toggleOverlay("receive") },
    { icon: Repeat2, tone: "swap", label: c.swap, action: () => requestOverlay("swap") },
    { icon: QrCode, tone: "scan", label: c.scan, action: () => openScan("pay") },
  ];

  return (
    <div className="space-y-4">
      {/* Wallet identity */}
      <div className="flex items-center justify-between gap-2">
        <PanelErrorBoundary title="Dompet utama gagal dimuat">
          <WalletSwitcher
            address={walletAddress}
            onCopy={() => copyText(walletAddress, c.address)}
            onShare={() => void shareAddress()}
            onSwitched={() => {
              void refreshBalances({ force: true });
            }}
          />
        </PanelErrorBoundary>
        <button
          type="button"
          onClick={() => setHideBalance(!hideBalance)}
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl gp-glass border gp-wallet-link-btn transition-colors"
        >
          {hideBalance ? <Eye className="w-4 h-4 gp-wallet-link-icon" strokeWidth={2} /> : <EyeOff className="w-4 h-4 gp-wallet-link-icon" strokeWidth={2} />}
        </button>
      </div>

      {/* Balance panel */}
      <div className="rounded-2xl border border-cyan-500/15 gp-wallet-panel overflow-hidden">
        <div className="px-4 pt-3.5 pb-3 border-b gp-divider">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="gp-muted text-[10px] uppercase tracking-widest mb-0.5">{w.availableBalance}</p>
              <h2 className="gp-num text-[1.75rem] font-black gp-text tracking-tight leading-tight">
                {hideBalance ? "••••••" : formatUsd(portfolioUsd)}
              </h2>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="gp-wallet-net-badge">
                <NetworkDot />
                <span>{w.sdaNetwork}</span>
              </div>
              {portfolioProfit > 0 && (
                <span className="gp-num text-emerald-400 text-[11px] font-medium">
                  +{formatUsd(portfolioProfit)}{GP_SEP_INLINE}returns
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Token holdings */}
        {balancesLoading ? (
          <div className="px-4 py-6 text-center">
            <RefreshCw className="w-5 h-5 mx-auto gp-muted animate-spin mb-2" />
            <p className="gp-muted text-xs">{lang === "id" ? "Memuat saldo…" : "Loading balances…"}</p>
          </div>
        ) : (
          <>
        <WalletHoldingsList
          tokens={safeTokens}
          hideBalance={hideBalance}
          formatUsd={formatUsd}
        />

        {/* Portfolio mix */}
        <PortfolioMix items={allocation} title={w.portfolioMix} />
          </>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-4 gap-2">
        {walletActions.map((a) => {
          const Icon = a.icon;
          return (
          <button
            key={a.label}
            onClick={a.action}
            className="gp-wallet-action flex flex-col items-center justify-center gap-1.5 min-h-[76px] py-3 px-1.5 rounded-2xl border transition-all active:scale-[0.97]"
          >
            <span className={`gp-wallet-action__icon--${a.tone}`}>
              <Icon className="w-5 h-5" strokeWidth={2} />
            </span>
            <span className="gp-text text-[10px] font-semibold leading-none text-center">{a.label}</span>
          </button>
          );
        })}
      </div>

      {/* NFT & Digital Identity */}
      <button
        type="button"
        onClick={() => toggleOverlay("nftIdentity")}
        className="w-full gp-glass border rounded-2xl px-4 py-3.5 flex items-center gap-3 gp-hover-row transition-all hover:border-emerald-500/25 active:scale-[0.99]"
      >
        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-amber-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
          <Award className="w-5 h-5 text-emerald-400" />
        </span>
        <div className="flex-1 min-w-0 text-left">
          <p className="gp-text text-sm font-bold">{w.nftIdentityMenu}</p>
          <p className="gp-muted text-[11px] mt-0.5 truncate">{w.nftIdentityMenuHint}</p>
        </div>
        {nftOwnedCount != null && (
          <span className="gp-num shrink-0 min-w-[1.75rem] h-7 px-2 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center justify-center">
            {nftOwnedCount}
          </span>
        )}
        <ChevronRight className="w-4 h-4 gp-muted shrink-0" />
      </button>

      {/* Network Tabs */}
      <div className="flex gap-2">
        {(["SDA", "ETH", "ALL"] as const).map((n) => (
          <button key={n}
            onClick={() => setActiveNet(n)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeNet === n ? "gp-pill-active" : "gp-pill"
            }`}
          >
            {n === "ALL" ? t.all : n}
          </button>
        ))}
      </div>

      {/* Token List */}
      {(() => {
        const filteredTokens = sortWalletTokens(safeTokens.filter((tok) => {
          if (activeNet === "ALL") return true;
          if (activeNet === "SDA") return ["GAT", "SDA", "USDT", "USDX"].includes(tok.symbol) || tok.custom;
          if (activeNet === "ETH") return tok.symbol === "ETH";
          return true;
        }));
        const tokenCountLabel = w.tokenListCount.replace("{count}", String(filteredTokens.length));

        return (
          <div className="gp-wallet-asset-section space-y-3">
            <div className="gp-wallet-asset-section__header flex items-center justify-between px-0.5">
              <h3 className="gp-wallet-asset-list__title gp-text">{w.tabAssets}</h3>
              <span className="gp-wallet-asset-list__count gp-muted gp-num">{tokenCountLabel}</span>
            </div>
            <div className="gp-wallet-asset-cards">
              <div className="gp-wallet-asset-cards__list">
                {filteredTokens.map((tok) => (
                  <GlassCard
                    key={tok.contractAddress ?? tok.symbol}
                    className="p-3.5 cursor-pointer gp-hover-row transition-all hover:border-emerald-500/20"
                    onClick={() => openDetail({
                      kind: "token",
                      symbol: tok.symbol,
                      ...(tok.contractAddress ? { contractAddress: tok.contractAddress } : {}),
                    })}
                  >
                    <WalletTokenRow token={tok} hideBalance={hideBalance} />
                  </GlassCard>
                ))}
              </div>
              <GlassCard
                className="p-3.5 flex items-center justify-center gap-2 cursor-pointer gp-hover-row transition-all border-dashed"
                onClick={() => requestOverlay("importToken")}
              >
                <Plus className="w-4 h-4 gp-muted" />
                <span className="gp-muted text-sm">{w.addCustomToken}</span>
              </GlassCard>
            </div>
          </div>
        );
      })()}

      {/* Transactions */}
      <div>
        <h3 className="gp-text font-semibold text-sm mb-3">{w.allTransactions}</h3>
        <div className="space-y-2">
          {transactions.length === 0 ? (
            <GlassCard className="p-4 text-center">
              <p className="gp-muted text-xs">{t.home.noActivity}</p>
            </GlassCard>
          ) : transactions.map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              onClick={() => openDetail({ kind: "transaction", id: tx.id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── AI Assistant Panel ───────────────────────────────────────────────────────
type ChatMsg = { role: "user" | "ai"; text: string };

const AIPanel = ({ onClose }: { onClose: () => void }) => {
  const { t, lang } = useLanguage();
  const {
    portfolioUsd, showToast, profileName, garudaPrimeSpendableGat, activeOnChainGat,
    isKycVerified, kycStatus, walletAddress, referralCode,
  } = useApp();
  const ai = t.ai;
  const aiLang = lang === "en" ? "en" : "id";

  const aiContext = useMemo(() => ({
    lang: aiLang,
    displayName: profileName,
    portfolioUsd,
    gatBalance: garudaPrimeSpendableGat,
    onChainGat: activeOnChainGat,
    walletConnected: Boolean(walletAddress && walletAddress !== "0x0000000000000000000000000000000000000000"),
    kycVerified: isKycVerified,
    kycStatus,
    referralCode,
    walletAddress,
  }), [
    aiLang, profileName, portfolioUsd, garudaPrimeSpendableGat, activeOnChainGat,
    walletAddress, isKycVerified, kycStatus, referralCode,
  ]);

  const initialGreeting = useMemo(
    () => buildInitialAiGreeting(aiContext, { greeting: ai.greeting, greetingNamed: ai.greetingNamed }),
    [aiContext, ai.greeting, ai.greetingNamed],
  );

  const [msgs, setMsgs] = useState<ChatMsg[]>([{ role: "ai", text: initialGreeting }]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [aiProvider, setAiProvider] = useState<"gemini" | "rules" | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  const allSuggestionChips = useMemo(() => {
    const seen = new Set<string>();
    const chips: string[] = [];
    const add = (label: string) => {
      if (seen.has(label)) return;
      seen.add(label);
      chips.push(label);
    };
    ai.quickSuggestions.forEach(add);
    ai.suggestionGroups.forEach((group) => group.items.forEach(add));
    return chips;
  }, [ai.quickSuggestions, ai.suggestionGroups]);

  useEffect(() => {
    setMsgs([{ role: "ai", text: initialGreeting }]);
    setAiProvider(null);
  }, [initialGreeting]);

  const clearChat = useCallback(() => {
    setMsgs([{ role: "ai", text: initialGreeting }]);
    setAiProvider(null);
    setInput("");
  }, [initialGreeting]);

  const sendMsg = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sendingRef.current) return;

    sendingRef.current = true;
    setInput("");
    setThinking(true);

    setMsgs((prev) => {
      const nextMsgs: ChatMsg[] = [...prev, { role: "user", text: trimmed }];
      void (async () => {
        try {
          const result = await sendGarudaAiMessage({
            messages: nextMsgs,
            ...aiContext,
          });
          setAiProvider(result.provider);
          setMsgs((current) => [...current, { role: "ai", text: result.reply }]);
        } catch {
          showToast(lang === "id" ? "Gagal menghubungi Garuda AI" : "Failed to reach Garuda AI", "error");
        } finally {
          setThinking(false);
          sendingRef.current = false;
        }
      })();
      return nextMsgs;
    });
  }, [aiContext, lang, showToast]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, thinking]);

  const statusLabel = aiProvider === "gemini"
    ? ai.statusGemini
    : aiProvider === "rules"
      ? ai.statusOffline
      : ai.subtitle;

  return (
    <div className="gp-ai-panel__root">
      <div className="gp-panel-head shrink-0">
      <div className="gp-panel-header flex items-center gap-3 p-4 pt-6">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/30 to-emerald-500/20 border border-amber-500/25 flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="gp-text font-semibold text-sm">{ai.title}</p>
          <div className="flex items-center gap-1.5">
            <NetworkDot />
            <p className="gp-muted text-[11px] truncate">{statusLabel}</p>
          </div>
        </div>
        <button type="button" onClick={clearChat} className="gp-muted gp-icon-btn p-1 shrink-0" aria-label={ai.clearChat} title={ai.clearChat}>
          <RefreshCw className="w-4 h-4" />
        </button>
        <button type="button" onClick={onClose} className="gp-muted gp-icon-btn p-1 shrink-0" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="gp-ai-panel__topics px-4 pb-2">
        <div className="gp-ai-panel__suggestions" role="list" aria-label={ai.suggestionsLabel}>
          {allSuggestionChips.map((s) => (
            <button key={s} type="button" onClick={() => void sendMsg(s)} className="gp-ai-panel__suggestion-chip">
              {s}
            </button>
          ))}
        </div>
      </div>
      </div>

      {/* Messages */}
      <div className="gp-panel-body flex-1 min-h-0 p-4 space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-medium rounded-br-sm"
                : "gp-ai-bot-bubble rounded-bl-sm"
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl gp-ai-bot-bubble rounded-bl-sm flex items-center gap-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                    animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity }}
                  />
                ))}
              </div>
              <span className="gp-muted text-xs">{ai.thinking}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="gp-ai-panel__composer border-t gp-divider">
        <p className="gp-muted text-[10px] px-4 pt-2">{ai.hint}</p>
        <div className="flex gap-2 px-4 pt-2 pb-1">
          <input
            type="text" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void sendMsg(input)}
            placeholder={ai.placeholder}
            className="flex-1 px-4 py-2.5 rounded-xl gp-input border focus:outline-none focus:border-emerald-500/40 text-sm"
          />
          <button type="button" onClick={() => void sendMsg(input)} disabled={!input.trim() || thinking}
            className="w-10 h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 flex items-center justify-center text-black disabled:opacity-40 transition-opacity"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const Sidebar = ({
  activeScreen, setScreen, onClose,
}: {
  activeScreen: Screen;
  setScreen: (s: Screen) => void;
  onClose: () => void;
}) => {
  const {
    toggleOverlay, setScreen: navScreen, showToast, isKycVerified, isKycPending, isKycRejected,
    openScan, openToolPanel, openProfile, profileName, startKycUpgrade,
    setPayQrChannel, openCommunity, referralConfig,
  } = useApp();
  const { t } = useLanguage();
  const tp = t.toolsPanel;
  const pd = t.profileDetails;
  const sidebarKycLabels = {
    kycFull: pd.kycFull,
    kycPending: pd.kycPendingShort,
    kycRejected: pd.kycRejected,
    kycLimited: pd.kycLimitedShort,
  };
  const { label: kycStatusLabel, tone: kycStatusTone } = getKycStatusDisplay(
    isKycVerified,
    isKycPending,
    isKycRejected,
    sidebarKycLabels,
  );

  const sidebarLabels: Record<string, string> = {
    "AI Assistant": t.sidebar.ai,
    "Sidra Chain": t.sidebar.sidraChain,
    "Payment Gateway": t.sidebar.payment,
    "Referral Program": t.sidebar.referral,
    "Merchant Center": t.sidebar.merchant,
    Assets: t.sidebar.assets,
    Transactions: t.sidebar.transactions,
    Analytics: t.sidebar.analytics,
    Reports: t.sidebar.reports,
    "Device Management": t.sidebar.devices,
    "Connected Wallets": t.sidebar.wallets,
    "KYC Verification": t.sidebar.kyc,
    Settings: t.sidebar.settings,
    "Help Center": t.sidebar.help,
  };

  const runToolAction = (label: string) => {
    onClose();
    switch (label) {
      case "AI Assistant":
        toggleOverlay("ai");
        break;
      case "Sidra Chain":
        openToolPanel("sidra-chain");
        break;
      case "Payment Gateway":
        setPayQrChannel("onchain");
        openScan("pay", true);
        break;
      case "Referral Program":
        openCommunity("referral");
        break;
      case "Merchant Center":
        openToolPanel("merchant");
        break;
      case "Assets":
        openToolPanel("assets");
        break;
      case "Transactions":
        openToolPanel("transactions");
        break;
      case "Analytics":
        openToolPanel("analytics");
        break;
      case "Reports":
        openToolPanel("reports");
        break;
      case "Device Management":
        openToolPanel("devices");
        break;
      case "Connected Wallets":
        openToolPanel("wallets");
        break;
      case "KYC Verification":
        openProfile("kyc");
        break;
      case "Settings":
        openProfile("main");
        break;
      case "Help Center":
        openToolPanel("help");
        break;
      case "Governance DAO":
        openToolPanel("governance");
        break;
      case "Mainnet Migration":
        openToolPanel("mainnet-migration");
        break;
      default:
        break;
    }
  };

  const referralVisible = isReferralProgramVisible(referralConfig);

  const extras = [
    { icon: <Layers className="w-4 h-4" />, label: "Sidra Chain" },
    ...(isGovernanceEnabled() ? [{ icon: <Vote className="w-4 h-4" />, label: "Governance DAO" }] : []),
    ...(isMainnetMigrationOpen() ? [{ icon: <Rocket className="w-4 h-4" />, label: "Mainnet Migration" }] : []),
    { icon: <Bot className="w-4 h-4" />, label: "AI Assistant" },
    { icon: <PieChart className="w-4 h-4" />, label: "Assets" },
    { icon: <Activity className="w-4 h-4" />, label: "Transactions" },
    { icon: <CreditCard className="w-4 h-4" />, label: "Payment Gateway" },
    { icon: <Store className="w-4 h-4" />, label: "Merchant Center" },
    ...(referralVisible ? [{ icon: <Gift className="w-4 h-4" />, label: "Referral Program" }] : []),
    { icon: <BarChart3 className="w-4 h-4" />, label: "Analytics" },
    { icon: <FileText className="w-4 h-4" />, label: "Reports" },
    { icon: <Smartphone className="w-4 h-4" />, label: "Device Management" },
    { icon: <Key className="w-4 h-4" />, label: "Connected Wallets" },
    { icon: <CheckCircle className="w-4 h-4" />, label: "KYC Verification" },
    { icon: <Settings className="w-4 h-4" />, label: "Settings" },
    { icon: <HelpCircle className="w-4 h-4" />, label: "Help Center" },
  ];

  return (
    <div className="flex flex-col h-full gp-side-panel overflow-hidden">
      {/* Profile */}
      <div className="gp-panel-header gp-sidebar-profile">
        <div className="gp-sidebar-profile__row">
          <ProfileAvatar size="md" rounded="xl" className="gp-sidebar-profile__avatar" />
          <div className="gp-sidebar-profile__meta">
            <p className="gp-sidebar-profile__name">{profileName}</p>
            <div className="gp-sidebar-profile__badges">
              <KycStatusBadge label={kycStatusLabel} tone={kycStatusTone} compact />
              <span className="gp-sidebar-badge gp-sidebar-badge--prime">
                <Award className="gp-sidebar-badge__icon fill-amber-400/90" strokeWidth={0} aria-hidden />
                {t.prime}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="gp-panel-body p-4 space-y-1" style={{ scrollbarWidth: "none" }}>
        <p className="gp-muted text-[10px] font-semibold uppercase tracking-widest px-2 mb-2">{t.main}</p>
        {SIDEBAR_ITEMS.map((item) => (
          <button
            key={item.labelKey}
            onClick={() => { setScreen(item.screen); onClose(); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
              activeScreen === item.screen
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                : "gp-muted gp-hover-row"
            }`}
          >
            {item.icon}
            {t.sidebar[item.labelKey]}
            {activeScreen === item.screen && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>
        ))}

        <p className="gp-muted text-[10px] font-semibold uppercase tracking-widest px-2 mb-2 mt-4">{t.tools}</p>
        {extras.map((e) => (
          <button
            key={e.label}
            type="button"
            onClick={() => runToolAction(e.label)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm gp-muted gp-hover-row transition-all"
          >
            {e.icon}
            {sidebarLabels[e.label] ?? e.label}
          </button>
        ))}

      </div>

      {/* Network Badge */}
      <div className="p-4 border-t gp-divider">
        <div className="flex items-center gap-2.5 p-3 rounded-xl gp-subtle border">
          <NetworkDot />
          <div className="min-w-0 flex-1">
            <p className="text-emerald-400 text-xs font-semibold leading-tight">{t.sidebar.networkBrand}</p>
            <p className="gp-muted text-[10px] leading-snug mt-0.5">
              {isPhase4Active()
                ? t.sidebar.networkStatusPhase4
                : t.sidebar.networkStatus}
            </p>
            <p className="gp-muted text-[9px] gp-num opacity-70 mt-0.5">{t.sidebar.networkBlock}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Notification Panel ───────────────────────────────────────────────────────
const NotifPanel = ({ onClose }: { onClose: () => void }) => {
  const {
    notifications, markAllRead, deleteNotification, deleteAllNotifications,
    openNotification, showToast, refreshNotifications,
  } = useApp();
  const { t, lang } = useLanguage();
  const locale = lang === "id" ? "id" : "en";
  const tp = t.toolsPanel;
  const hasNotifications = notifications.length > 0;

  useEffect(() => {
    if (typeof refreshNotifications === "function") {
      void refreshNotifications();
    }
  }, [refreshNotifications]);

  const notifGroups = ACTIVITY_GROUP_ORDER.map((key) => ({
    key,
    label: key === "today" ? tp.txGroupToday : key === "yesterday" ? tp.txGroupYesterday : tp.txGroupEarlier,
  }));

  const handleMarkAllRead = () => {
    markAllRead();
    showToast(t.notifAllRead, "success");
  };

  const handleDeleteAll = () => {
    if (!hasNotifications) return;
    deleteAllNotifications();
    showToast(t.notifAllDeleted, "info");
  };

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    deleteNotification(id);
    showToast(t.notifDeleted, "info");
  };

  const notifIcon = (type: string) => {
    switch (type) {
      case "receive": return { bg: "bg-emerald-500/15", icon: <ArrowDownLeft className="w-4 h-4 text-emerald-400" /> };
      case "wallet": return { bg: "bg-cyan-500/15", icon: <Wallet className="w-4 h-4 text-cyan-400" /> };
      case "invest": return { bg: "bg-amber-500/15", icon: <TrendingUp className="w-4 h-4 text-amber-400" /> };
      case "kyc": return { bg: "bg-indigo-500/15", icon: <Shield className="w-4 h-4 text-indigo-400" /> };
      case "alert": return { bg: "bg-red-500/15", icon: <AlertCircle className="w-4 h-4 text-red-400" /> };
      case "order": return { bg: "bg-orange-500/15", icon: <ShoppingBag className="w-4 h-4 text-orange-400" /> };
      case "market": return { bg: "bg-violet-500/15", icon: <Store className="w-4 h-4 text-violet-400" /> };
      case "staking": return { bg: "bg-cyan-500/15", icon: <Layers className="w-4 h-4 text-cyan-400" /> };
      case "referral": return { bg: "bg-blue-500/15", icon: <Link2 className="w-4 h-4 text-blue-400" /> };
      case "governance": return { bg: "bg-violet-500/15", icon: <Vote className="w-4 h-4 text-violet-400" /> };
      case "system": return { bg: "bg-zinc-500/15", icon: <Megaphone className="w-4 h-4 text-zinc-300" /> };
      default: return { bg: "bg-blue-500/15", icon: <Users className="w-4 h-4 text-blue-400" /> };
    }
  };

  return (
  <div className="flex flex-col h-full">
    <div className="gp-panel-header flex items-center justify-between p-4">
      <div>
        <h3 className="gp-text font-bold text-base">{t.notifications}</h3>
        <p className="gp-muted text-xs">{notifications.filter((n) => !n.read).length} {t.unread}</p>
      </div>
      <div className="gp-notif-panel__actions">
        <button
          type="button"
          onClick={() => void refreshNotifications()}
          className="gp-notif-panel__action gp-notif-panel__action--read"
          aria-label={tp.txRefresh}
          title={tp.txRefresh}
        >
          <RefreshCw className="gp-notif-panel__action-icon" strokeWidth={2} />
        </button>
        {hasNotifications && (
          <>
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="gp-notif-panel__action gp-notif-panel__action--read"
              aria-label={t.markAllRead}
              title={t.markAllRead}
            >
              <CheckCheck className="gp-notif-panel__action-icon" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={handleDeleteAll}
              className="gp-notif-panel__action gp-notif-panel__action--delete"
              aria-label={t.deleteAllNotif}
              title={t.deleteAllNotif}
            >
              <Trash2 className="gp-notif-panel__action-icon" strokeWidth={2} />
            </button>
          </>
        )}
        <button type="button" onClick={onClose} className="gp-notif-panel__action gp-notif-panel__action--close" aria-label="Close">
          <X className="gp-notif-panel__action-icon" strokeWidth={2} />
        </button>
      </div>
    </div>
    <div className="gp-panel-body" style={{ scrollbarWidth: "none" }}>
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <Bell className="w-10 h-10 gp-muted mb-3 opacity-40" />
          <p className="gp-muted text-sm">{t.notifEmpty}</p>
          <p className="gp-muted/60 text-xs mt-1">{t.notifTapHint}</p>
        </div>
      ) : notifGroups.map((group) => {
        const items = notifications.filter((n) => activityTimeGroup(n.createdAt) === group.key);
        if (!items.length) return null;
        return (
          <div key={group.key}>
            <p className="px-4 pt-3 pb-1 text-[11px] font-semibold gp-muted uppercase tracking-wide">
              {group.label}
            </p>
            {items.map((n) => {
        const style = notifIcon(n.type);
        return (
        <div
          key={n.id}
          className={`gp-notif-row border-b gp-divider ${!n.read ? "gp-notif-row--unread" : ""}`}
        >
          <button
            type="button"
            onClick={() => { openNotification(n.id); onClose(); }}
            className="gp-notif-row__main"
          >
            <div className={`gp-notif-row__icon ${style.bg}`}>
              {style.icon}
            </div>
            <div className="gp-notif-row__body">
              <div className="gp-notif-row__title-row">
                <p className="gp-notif-row__title">{n.title}</p>
                {!n.read && <span className="gp-notif-row__dot" aria-hidden />}
              </div>
              <p className="gp-notif-row__text">{n.body}</p>
              <p className="gp-notif-row__time">{formatNotifTime(n.createdAt, locale)}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={(e) => handleDelete(e, n.id)}
            className="gp-notif-row__delete"
            aria-label={t.notifDelete}
          >
            <Trash2 className="gp-notif-row__delete-icon" strokeWidth={2} />
          </button>
        </div>
        );
      })}
          </div>
        );
      })}
    </div>
  </div>
  );
};

// ─── Top Bar ──────────────────────────────────────────────────────────────────
const TopBar = ({
  toggleOverlay, overlay, unreadCount, openProfile, closeProfile,
}: {
  toggleOverlay: (o: Overlay) => void;
  overlay: Overlay; unreadCount: number;
  openProfile: (section?: ProfileSection) => void;
  closeProfile: () => void;
}) => {
  const { t } = useLanguage();
  const aiOpen = overlay === "ai";

  return (
  <header className="gp-top-bar">
    <div className="gp-top-bar__start">
      <button
        type="button"
        onClick={() => toggleOverlay(overlay === "sidebar" ? "none" : "sidebar")}
        className="gp-top-bar__action-btn gp-icon-btn"
        aria-label="Menu"
      >
        <Menu className="gp-top-bar__action-icon" />
      </button>
      <div className="gp-top-bar__brand" aria-label={APP_NAME}>
        <span className="gp-top-bar-brand gp-top-bar-brand--strip">
          <span className="gp-top-bar-brand__name">{t.common.brand ?? APP_NAME}</span>
        </span>
      </div>
    </div>

    <div className="gp-top-bar__actions">
      <button
        type="button"
        onClick={() => toggleOverlay(aiOpen ? "none" : "ai")}
        className={`gp-top-bar__action-btn gp-icon-btn gp-top-bar__action-btn--ai${aiOpen ? " gp-top-bar__action-btn--ai-active" : ""}`}
        aria-label={t.ai.title}
        aria-pressed={aiOpen}
      >
        <Bot className="gp-top-bar__action-icon" />
      </button>
      <button
        type="button"
        onClick={() => toggleOverlay(overlay === "notifications" ? "none" : "notifications")}
        className="relative gp-top-bar__action-btn gp-icon-btn"
        aria-label={t.notifications}
      >
        <Bell className="gp-top-bar__action-icon" />
        {unreadCount > 0 && (
          <span className="gp-top-bar__notif-badge" aria-hidden />
        )}
      </button>
      <button
        type="button"
        onClick={() => (overlay === "profile" ? closeProfile() : openProfile("main"))}
        className="gp-top-bar__action-btn gp-top-bar__action-btn--avatar"
        aria-label={t.profile}
      >
        <ProfileAvatar size="topbar" rounded="xl" />
      </button>
    </div>
  </header>
  );
};

// ─── Bottom Nav ───────────────────────────────────────────────────────────────
const BottomNav = ({
  activeScreen, setScreen,
}: { activeScreen: Screen; setScreen: (s: Screen) => void }) => {
  const { t } = useLanguage();
  const tabs: { screen: Screen; icon: React.ReactNode; label: string }[] = [
    { screen: "home", icon: <Home className="w-5 h-5" />, label: t.nav.home },
    { screen: "wallet", icon: <Wallet className="w-5 h-5" />, label: t.nav.wallet },
    { screen: "invest", icon: <TrendingUp className="w-5 h-5" />, label: t.nav.invest },
    { screen: "market", icon: <ShoppingBag className="w-5 h-5" />, label: t.nav.market },
    { screen: "community", icon: <Users className="w-5 h-5" />, label: t.nav.community },
  ];

  return (
    <div className="shrink-0 border-t gp-bottom-bar bg-[var(--gp-bg-bar)]">
      <div className="flex items-center justify-around py-2 px-1">
        {tabs.map((tab) => {
          const active = activeScreen === tab.screen;
          return (
            <button key={tab.screen} onClick={() => setScreen(tab.screen)}
              className="flex flex-col items-center gap-1 py-1.5 px-3 rounded-2xl transition-all relative"
            >
              {active && (
                <motion.div
                  layoutId="tabIndicator"
                  className="absolute inset-0 rounded-2xl bg-emerald-500/12 border border-emerald-500/20"
                />
              )}
              <span className={`relative transition-colors ${active ? "text-emerald-400" : "gp-muted"}`}>
                {tab.icon}
              </span>
              <span className={`relative text-[10px] font-semibold transition-colors ${active ? "text-emerald-400" : "gp-muted"}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
const MainApp = () => {
  const {
    screen, setScreen, overlay, setOverlay, toggleOverlay, openProfile, closeProfile,
    profileSection,
    notifications, closeDetail, activeTool, tokens, transactions, detail, marketProducts,
    investmentFunds, refreshAppData, showToast,
  } = useApp();
  const { t } = useLanguage();

  const mainScrollRef = useRef<HTMLElement>(null);
  const runAppRefresh = useCallback(async () => {
    await refreshAppData();
    showToast(t.dataRefreshed, "success");
  }, [refreshAppData, showToast, t]);
  const handlePullRefresh = useCallback(async () => {
    await runAppRefresh();
  }, [runAppRefresh]);
  usePullToRefresh(mainScrollRef, handlePullRefresh, { disabled: overlay !== "none" });

  const investments = useMemo(() => withFundIcons(investmentFunds), [investmentFunds]);
  const unread = notifications.filter((n) => !n.read).length;

  const closeOverlay = () => {
    if (overlay === "token" || overlay === "fund" || overlay === "product" || overlay === "transaction") closeDetail();
    else if (overlay === "profile") closeProfile();
    else setOverlay("none");
  };

  const bottomModals: Overlay[] = ["send", "receive", "swap", "pay", "scan", "token", "fund", "product", "invest", "importToken"];
  const txDetailId = detail?.kind === "transaction" ? detail.id : null;
  const showBottomModal = bottomModals.includes(overlay);

  return (
    <div className="relative flex flex-1 flex-col min-h-0 h-full gp-main-app overflow-hidden">
      <BootDataLoader />
      {/* Background glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-emerald-500/[0.04] blur-3xl" />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-amber-500/[0.03] blur-3xl" />
      </div>

      {/* Sidebar overlay */}
      <AnimatePresence>
        {overlay === "sidebar" && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 gp-overlay-backdrop z-30"
              onClick={() => setOverlay("none")}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="absolute top-0 left-0 w-72 h-full z-40 shadow-2xl"
            >
              <Sidebar
                activeScreen={screen}
                setScreen={(s) => { setScreen(s); setOverlay("none"); }}
                onClose={() => setOverlay("none")}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Right panel overlay (notifications / profile / ai) */}
      <AnimatePresence>
        {(overlay === "notifications" || overlay === "profile" || overlay === "ai" || overlay === "tool" || overlay === "nftIdentity") && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 gp-overlay-backdrop z-30"
              onClick={() => (overlay === "profile" ? closeProfile() : setOverlay("none"))}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className={`absolute z-50 gp-side-panel shadow-2xl overflow-hidden flex flex-col h-full min-h-0 ${
                overlay === "profile"
                  ? "inset-0 gp-profile-panel"
                  : overlay === "ai" || overlay === "nftIdentity"
                    ? "inset-0 gp-ai-panel sm:inset-auto sm:top-0 sm:right-0 sm:w-full sm:max-w-md sm:border-l"
                    : "top-0 right-0 w-full max-w-sm border-l"
              }`}
            >
              {overlay === "notifications" && (
                <PanelErrorBoundary title="Notifikasi gagal dimuat">
                  <NotifPanel onClose={() => setOverlay("none")} />
                </PanelErrorBoundary>
              )}
              {overlay === "profile" && <ProfilePanel key={profileSection} onClose={closeProfile} />}
              {overlay === "ai" && <AIPanel onClose={() => setOverlay("none")} />}
              {overlay === "nftIdentity" && (
                <LazyNftIdentityPanel onClose={() => setOverlay("none")} />
              )}
              {overlay === "tool" && activeTool === "sidra-chain" && (
                <LazySidraChainPanel onClose={() => setOverlay("none")} />
              )}
              {overlay === "tool" && activeTool === "governance" && (
                <LazyGovernancePanel onClose={() => setOverlay("none")} />
              )}
              {overlay === "tool" && activeTool === "mainnet-migration" && (
                <LazyMainnetMigrationPanel onClose={() => setOverlay("none")} />
              )}
              {overlay === "tool" && activeTool && activeTool !== "sidra-chain" && activeTool !== "governance" && activeTool !== "mainnet-migration" && (
                <LazyToolsPanel tool={activeTool} onClose={() => setOverlay("none")} />
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Transaction detail, dedicated layer above side panels */}
      <AnimatePresence>
        {overlay === "transaction" && txDetailId != null && (
          <>
            <motion.div
              key="tx-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 gp-overlay-panel z-[45]"
              onClick={closeOverlay}
            />
            <motion.div
              key="tx-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280 }}
              className="absolute bottom-0 left-0 right-0 z-[50] gp-modal-sheet border-t rounded-t-3xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="gp-modal-handle w-10 h-1 rounded-full mx-auto mt-3 mb-1" />
              <PanelErrorBoundary title="Detail transaksi gagal dimuat">
                <TransactionDetailModal txId={txDetailId} transactions={transactions} onClose={closeOverlay} />
              </PanelErrorBoundary>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom modals */}
      <AnimatePresence>
        {showBottomModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 gp-overlay-panel z-30"
              onClick={closeOverlay}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280 }}
              className="absolute bottom-0 left-0 right-0 z-40 gp-modal-sheet border-t rounded-t-3xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="gp-modal-handle w-10 h-1 rounded-full mx-auto mt-3 mb-1" />
              {overlay === "send" && <LazySendModal tokens={tokens} onClose={closeOverlay} />}
              {overlay === "receive" && <LazyReceiveModal onClose={closeOverlay} />}
              {overlay === "swap" && <LazySwapModal tokens={tokens} onClose={closeOverlay} />}
              {overlay === "pay" && <LazyPayModal onClose={closeOverlay} />}
              {overlay === "scan" && <LazyScanModal onClose={closeOverlay} />}
              {overlay === "token" && <TokenDetailModal tokens={tokens} onClose={closeOverlay} />}
              {overlay === "fund" && <FundDetailModal investments={investments} onClose={closeOverlay} />}
              {overlay === "product" && <ProductDetailModal products={marketProducts} onClose={closeOverlay} />}
              {overlay === "invest" && <InvestModal investments={investments} onClose={() => setOverlay("none")} />}
              {overlay === "importToken" && <AddCustomTokenModal onClose={closeOverlay} />}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main ref={mainScrollRef} className="gp-main-scroll relative" style={{ scrollbarWidth: "none" }}>
        <TopBar
          toggleOverlay={toggleOverlay}
          overlay={overlay}
          unreadCount={unread}
          openProfile={openProfile}
          closeProfile={closeProfile}
        />
        <div className="gp-main-content max-w-lg mx-auto px-4 pb-6">
          <AnimatePresence initial={false}>
            {screen === "home" && (
              <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                <HomeScreen />
              </motion.div>
            )}
            {screen === "wallet" && (
              <motion.div key="wallet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                <PanelErrorBoundary title="Dompet gagal dimuat">
                  <WalletScreen />
                </PanelErrorBoundary>
              </motion.div>
            )}
            {screen === "invest" && (
              <motion.div key="invest" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                <LazyInvestScreen />
              </motion.div>
            )}
            {screen === "market" && (
              <motion.div key="market" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                <LazyMarketScreen />
              </motion.div>
            )}
            {screen === "community" && (
              <motion.div key="community" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                <LazyCommunityScreen />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <BottomNav activeScreen={screen} setScreen={(s) => { setScreen(s); setOverlay("none"); }} />
      <SecurityOverlays />
    </div>
  );
};

// ─── App Provider Shell ───────────────────────────────────────────────────────
const KycMessageSync = () => {
  const { t } = useLanguage();
  const { setKycBlockedMessage } = useApp();
  useEffect(() => {
    setKycBlockedMessage(t.toast.kycRequired);
  }, [t, setKycBlockedMessage]);
  return null;
};

const GarudaApp = () => {
  const { t } = useLanguage();
  const { signOut, user, userProfile, connectedWallet, refreshUserProfile } = useAuth();
  const [garudaSignerAddress, setGarudaSignerAddress] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!user?.uid) {
      setGarudaSignerAddress(undefined);
      return;
    }
    let cancelled = false;
    void autoActivateGarudaPrimeWallet(user.uid, {
      profileAddress: userProfile?.walletAddress,
      includePayHub: true,
    }).then((addr) => {
      if (!cancelled && addr) setGarudaSignerAddress(addr);
    });
    return () => { cancelled = true; };
  }, [user?.uid, userProfile?.walletAddress]);

  const liveWalletAddress = useMemo(
    () => resolveOnChainBalanceAddress({
      profileAddress: userProfile?.walletAddress,
      connectedWallet,
    }) || garudaSignerAddress || undefined,
    [garudaSignerAddress, userProfile?.walletAddress, connectedWallet],
  );

  const liveWalletProvider = useMemo(() => {
    if (!liveWalletAddress) return null;
    return resolveTransactionWalletProvider(liveWalletAddress, connectedWallet ?? undefined);
  }, [liveWalletAddress, connectedWallet]);

  useEffect(() => {
    clearBootBlockers();
  }, []);

  useEffect(() => {
    if (liveWalletAddress) {
      warmQrImageCache(encodeReceiveQrPayload(liveWalletAddress), 176);
    }
    const uid = user?.uid?.trim();
    if (uid) {
      warmQrImageCache(canonicalMerchantIdForOwner(uid), 176);
    }
  }, [liveWalletAddress, user?.uid, user?.displayName, userProfile?.fullName, userProfile?.displayName]);

  return (
    <AppProvider
      onSignOut={signOut}
      onRefreshUserProfile={refreshUserProfile}
      kycBlockedMessage={t.toast.kycRequired}
      kycVerifiedMessage={t.toast.kycVerified}
      kycPendingMessage={t.toast.kycPending}
      profileName={user?.displayName ?? userProfile?.fullName}
      profileEmail={user?.email ?? userProfile?.email}
      profilePhone={user?.phone ?? userProfile?.phone}
      profileAvatar={user?.avatar ?? userProfile?.avatar ?? null}
      walletAddress={liveWalletAddress}
      walletProvider={liveWalletProvider}
      userId={user?.uid}
      isDemoUser={Boolean(user?.isDemo)}
      kycTierFromServer={userProfile?.kycTier}
      kycStatusFromServer={userProfile?.kycStatus ?? user?.kycStatus}
      kycRejectionReasonFromServer={userProfile?.kycRejectionReason}
    >
      <KycMessageSync />
      <div className="flex flex-1 flex-col min-h-0 h-full w-full">
        <MainApp />
      </div>
    </AppProvider>
  );
};

// ─── Root App ─────────────────────────────────────────────────────────────────
function AppShell() {
  const { phase, user } = useAuth();

  if (typeof window !== "undefined" && isKycPortCallbackPath()) {
    return <KycPortCallbackScreen />;
  }

  const boundaryKey = `${phase}:${user?.uid ?? ""}`;

  return (
    <AppErrorBoundary resetKey={boundaryKey}>
      <AppFlow>
        <MobileShell>
          <GarudaApp />
        </MobileShell>
      </AppFlow>
    </AppErrorBoundary>
  );
}

export default function App() {
  return <AppShell />;
}
