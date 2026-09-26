import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Users, BarChart3, Globe, Calculator, Gift, Copy, Share2, BookOpen,
  Handshake, ChevronRight, Heart, X, Play, Info, GraduationCap, HandHeart,
  ListChecks, Lightbulb, BookMarked, MessageCircle,
} from "lucide-react";
import { useApp, type CommunityTab } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import { tokenToUsd } from "./tokenEconomy";
import { usdToGatPayHub } from "../lib/payhub/payHubAmounts";
import { CommunitySocialFeed } from "./CommunitySocialFeed";
import { buildReferralTierRows } from "../lib/referral/referralDisplay";
import { buildReferralShareUrl } from "../lib/referral/referralRef";
import { isReferralProgramVisible, isReferralUsageEnabled } from "../lib/referral/referralProgramGate";
import { ReferralLockedNotice } from "../features/referral/ReferralLockedNotice";
import {
  fetchCommunityFundsSummary,
  type CommunityFundsPublicSummary,
} from "../lib/protocol/communityFundsService";

const COURSE_DURATIONS = [25, 35, 40, 30];

const InfoBox = ({ title, info, accent = "emerald" }: { title: string; info: string; accent?: "emerald" | "amber" | "red" | "indigo" }) => (
  <div className={`gp-callout gp-callout--${accent}`}>
    <Info className="gp-callout__icon w-4 h-4 shrink-0 mt-0.5" strokeWidth={2} />
    <div className="min-w-0">
      <p className="gp-callout__title">{title}</p>
      <p className="gp-callout__text">{info}</p>
    </div>
  </div>
);

const CommunityFundBanner = ({
  kind,
  funds,
}: {
  kind: "zakat" | "charity";
  funds: CommunityFundsPublicSummary | null;
}) => {
  if (!funds) return null;
  const stats = kind === "zakat" ? funds.zakat : funds.charity;
  const label = kind === "zakat" ? "Dana Zakat" : "Dana Sadaqah";
  const recent = funds.recentDisbursements.filter((d) => d.fund === kind).slice(0, 2);

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="gp-text text-xs font-semibold">{label}</p>
        <span className="gp-num text-emerald-400 font-bold text-sm">
          {stats.balanceGat.toLocaleString(undefined, { maximumFractionDigits: 2 })} GAT
        </span>
      </div>
      <p className="gp-muted text-[10px]">
        Terkumpul {stats.totalReceived.toLocaleString(undefined, { maximumFractionDigits: 0 })} GAT ·
        Terdistribusi {stats.totalDisbursed.toLocaleString(undefined, { maximumFractionDigits: 0 })} GAT
      </p>
      {recent.length > 0 && (
        <div className="text-[10px] gp-muted space-y-1">
          {recent.map((d) => (
            <p key={d.id}>
              → {d.recipientName}: {d.amountGat.toLocaleString()} GAT
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

const StatsRow = () => {
  const { communityConfig } = useApp();
  const { t } = useLanguage();
  const cm = t.community;
  const stats = [
    { label: cm.members, value: communityConfig.overview.members, icon: <Users className="w-4 h-4" /> },
    { label: cm.volume, value: communityConfig.overview.volume, icon: <BarChart3 className="w-4 h-4" /> },
    { label: cm.countries, value: communityConfig.overview.countries, icon: <Globe className="w-4 h-4" /> },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map((s) => (
        <div key={s.label} className="gp-glass border rounded-2xl p-3 text-center">
          <div className="flex justify-center mb-1.5 text-emerald-400">{s.icon}</div>
          <p className="gp-num gp-text font-black text-base">{s.value}</p>
          <p className="gp-muted text-[10px] mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
};

const OverviewPanel = ({ onNavigate }: { onNavigate: (tab: CommunityTab) => void }) => {
  const { referralConfig } = useApp();
  const { t } = useLanguage();
  const cm = t.community;
  const referralVisible = isReferralProgramVisible(referralConfig);
  const cards: { tab: CommunityTab; icon: React.ReactNode; accent: string }[] = [
    { tab: "feed", icon: <MessageCircle className="w-5 h-5 text-cyan-400" />, accent: "border-cyan-500/20" },
    { tab: "zakat", icon: <Calculator className="w-5 h-5 text-amber-400" />, accent: "border-amber-500/20" },
    ...(referralVisible ? [{ tab: "referral" as CommunityTab, icon: <Gift className="w-5 h-5 text-emerald-400" />, accent: "border-emerald-500/20" }] : []),
    { tab: "learn", icon: <GraduationCap className="w-5 h-5 text-indigo-400" />, accent: "border-indigo-500/20" },
    { tab: "charity", icon: <Heart className="w-5 h-5 text-red-400" />, accent: "border-red-500/20" },
  ];

  return (
    <div className="space-y-4">
      <InfoBox title={cm.overviewTitle} info={cm.overviewInfo} />
      <StatsRow />
      <div>
        <h3 className="gp-text font-semibold text-sm mb-2">{cm.exploreSections}</h3>
        <div className="space-y-2">
          {cards.map(({ tab, icon, accent }) => {
            const card = cm.sectionCards[tab];
            const desc =
              tab === "referral" && referralVisible
                ? cm.referralDesc(referralConfig.baseRewardGat)
                : card.desc;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => onNavigate(tab)}
                className={`w-full gp-glass border rounded-2xl p-4 flex items-center gap-3 hover:border-emerald-500/25 transition-all text-left ${accent}`}
              >
                <div className="w-10 h-10 rounded-xl gp-subtle flex items-center justify-center shrink-0">{icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="gp-text text-sm font-semibold">{card.title}</p>
                  <p className="gp-muted text-xs mt-0.5 leading-snug">{desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 gp-muted shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const ZakatPanel = ({ funds }: { funds: CommunityFundsPublicSummary | null }) => {
  const { showToast, requireKyc, portfolioUsd, communityConfig, payZakat } = useApp();
  const { t } = useLanguage();
  const cm = t.community;
  const [zakatAmount, setZakatAmount] = useState("");
  const [paying, setPaying] = useState(false);

  const rate = communityConfig.zakat.nisabRateBps / 10_000;
  const zakatCalc = zakatAmount ? (parseFloat(zakatAmount) * rate).toFixed(2) : "0.00";
  const zakatGat = zakatAmount ? usdToGatPayHub(parseFloat(zakatCalc)).toFixed(2) : "0.00";
  const feeGat = communityConfig.zakat.protocolFeeBps > 0
    ? ((parseFloat(zakatGat || "0") * communityConfig.zakat.protocolFeeBps) / 10_000).toFixed(4)
    : "0";

  const netGat = communityConfig.zakat.protocolFeeBps > 0
    ? (parseFloat(zakatGat || "0") * (1 - communityConfig.zakat.protocolFeeBps / 10_000)).toFixed(4)
    : zakatGat;

  const handlePayZakat = async () => {
    if (!communityConfig.zakat.enabled) {
      showToast("Zakat sedang dinonaktifkan admin", "warning");
      return;
    }
    if (!zakatAmount || parseFloat(zakatAmount) <= 0) { showToast(t.toast.zakatEnter, "error"); return; }
    if (!requireKyc(t.toast.kycRequired)) return;
    setPaying(true);
    const ok = await payZakat(parseFloat(zakatAmount));
    setPaying(false);
    if (ok) setZakatAmount("");
  };

  const fillPortfolio = () => setZakatAmount(String(Math.round(portfolioUsd)));

  return (
    <div className="space-y-4">
      <CommunityFundBanner kind="zakat" funds={funds} />
      <InfoBox title={cm.zakatCalculator} info={cm.zakatInfo} accent="amber" />
      <p className="gp-muted text-[11px] px-1 leading-relaxed">{cm.zakatHowItWorks}</p>
      <p className="text-[10px] text-amber-400/80 px-1">{cm.nisabNote}</p>

      <div className="gp-glass border rounded-2xl p-4 border-amber-500/20">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Calculator className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="gp-text font-semibold text-sm">{cm.zakatCalculator}</p>
            <p className="gp-muted text-[11px]">{cm.zakatDesc}</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs gp-muted mb-1.5 block">{cm.zakatInputLabel}</label>
            <div className="flex gap-2">
              <input
                type="number" value={zakatAmount} onChange={(e) => setZakatAmount(e.target.value)}
                placeholder={portfolioUsd > 0 ? `e.g. ${Math.round(portfolioUsd)}` : "e.g. 10000"}
                className="flex-1 px-4 py-3 rounded-xl gp-input border focus:outline-none focus:border-amber-500/40 text-sm gp-num"
              />
              <button type="button" onClick={fillPortfolio} className="px-3 py-2 rounded-xl gp-pill text-[10px] font-semibold shrink-0">
                {t.max}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <span className="gp-muted text-[10px] block mb-1">{cm.zakatDue}</span>
              <span className="gp-num text-amber-400 font-black text-lg">${zakatCalc}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="gp-muted text-[10px] block mb-1">{cm.zakatGatEst}</span>
              <span className="gp-num text-emerald-400 font-black text-lg">{zakatGat} GAT</span>
            </div>
          </div>
          {communityConfig.zakat.protocolFeeBps > 0 && (
            <p className="gp-muted text-[10px] mb-2">
              Protocol fee: ~{feeGat} GAT ({communityConfig.zakat.protocolFeeBps} bps) · Net ke dana zakat: ~{netGat} GAT
            </p>
          )}
          <button
            type="button"
            onClick={handlePayZakat}
            disabled={paying || !communityConfig.zakat.enabled}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm disabled:opacity-50"
          >
            {paying ? "…" : cm.payZakat}
          </button>
        </div>
      </div>
    </div>
  );
};

const ReferralPanel = () => {
  const {
    copyText, showToast, referralCode, referralConfig, referralStats, referralLoading,
    openToolPanel, refreshReferralStats,
  } = useApp();
  const { t } = useLanguage();
  const cm = t.community;
  const usageEnabled = isReferralUsageEnabled(referralConfig);

  if (!isReferralProgramVisible(referralConfig)) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4 text-center text-sm gp-muted">
        Program referral sedang dinonaktifkan.
      </div>
    );
  }

  const handleLockedAction = () => {
    showToast(cm.referralLockedActionToast, "warning");
  };

  const handleShareReferral = async () => {
    if (!usageEnabled) {
      handleLockedAction();
      return;
    }
    const link = buildReferralShareUrl(referralCode);
    await copyText(link, cm.referralShareLink);
    showToast(cm.referralLinkCopied, "success");
    if (navigator.share) {
      try {
        await navigator.share({ title: cm.referralProgram, text: referralCode, url: link });
      } catch { /* cancelled */ }
    }
  };

  const steps = [
    { n: "1", title: cm.referralStep1, icon: <Copy className="w-4 h-4" /> },
    { n: "2", title: cm.referralStep2, icon: <Share2 className="w-4 h-4" /> },
    { n: "3", title: cm.referralStep3(referralConfig.requireKycTier), icon: <Users className="w-4 h-4" /> },
    { n: "4", title: cm.referralStep4, icon: <Gift className="w-4 h-4" /> },
  ];

  const tierRows = buildReferralTierRows(referralConfig);
  const boundCode = referralStats?.referredByCode;

  const rewardDistributionNote = (() => {
    const policy = referralStats?.rewardPolicy;
    if (!policy) return cm.referralAutoReward;
    if (policy.lockedUntilTokenLaunch || policy.distributionMode === "locked") {
      return cm.referralRewardLockedNote;
    }
    if (!policy.payoutReady) return cm.referralPayoutNotReady;
    if (policy.distributionMode === "sidra_treasury") return cm.referralRewardSidraTreasury;
    return cm.referralRewardPayHub;
  })();

  return (
    <div className="space-y-4">
      {!usageEnabled && (
        <ReferralLockedNotice
          title={cm.referralLockedTitle}
          compact
        />
      )}

      <InfoBox
        title={cm.referralProgram}
        info={cm.referralInfo(referralConfig.baseRewardGat, referralConfig.requireKycTier)}
      />

      {boundCode && usageEnabled ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2.5 text-xs gp-text">
          {cm.referralAlreadyBound.replace("{code}", boundCode)}
        </div>
      ) : !usageEnabled ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2.5 text-xs gp-muted leading-relaxed">
          {cm.referralLockedUsageHint}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-500/20 bg-slate-500/[0.05] px-3 py-2.5 text-xs gp-muted leading-relaxed">
          {cm.referralNoSponsor}
        </div>
      )}

      {referralStats && (
        <div className="gp-referral-stats">
          <div className="gp-referral-stats__head">
            <h4 className="gp-referral-stats__title">{cm.referralYourStats}</h4>
            {referralStats.autoReward && (
              <span className="gp-referral-stats__badge">AUTO</span>
            )}
          </div>

          <div className="gp-referral-stats__grid">
            <div className="gp-referral-stats__cell">
              <p className="gp-referral-stats__value gp-referral-stats__value--pink">{referralStats.totalReferred}</p>
              <p className="gp-referral-stats__label">{cm.referralReferredShort}</p>
            </div>
            <div className="gp-referral-stats__cell">
              <p className="gp-referral-stats__value gp-referral-stats__value--green">
                {referralStats.totalEarnedGat} <span className="gp-referral-stats__unit">GAT</span>
              </p>
              <p className="gp-referral-stats__label">{cm.referralEarnedShort}</p>
            </div>
            <div className="gp-referral-stats__cell">
              <p className="gp-referral-stats__value gp-referral-stats__value--amber">
                {referralStats.pendingRewardGat} <span className="gp-referral-stats__unit">GAT</span>
              </p>
              <p className="gp-referral-stats__label">{cm.referralPendingShort}</p>
            </div>
            <div className="gp-referral-stats__cell">
              <p className="gp-referral-stats__value gp-referral-stats__value--cyan">
                {referralStats.tierBonusesTotal} <span className="gp-referral-stats__unit">GAT</span>
              </p>
              <p className="gp-referral-stats__label">{cm.referralTierBonusShort}</p>
            </div>
          </div>

          {referralStats.autoReward && (
            <p className="gp-referral-stats__note">{rewardDistributionNote}</p>
          )}

          {referralStats.nextTier && (
            <div className="gp-referral-stats__progress">
              <div className="gp-referral-stats__progress-head">
                <p className="gp-referral-stats__progress-label">
                  {cm.referralNextTier(referralStats.nextTier.remaining, referralStats.nextTier.bonusGat, referralStats.nextTier.label)}
                </p>
                <span className="gp-referral-stats__progress-count">
                  {cm.referralTierProgress(referralStats.completed, referralStats.nextTier.minReferrals)}
                </span>
              </div>
              <div className="gp-referral-stats__track">
                <div
                  className="gp-referral-stats__fill"
                  style={{ width: `${Math.min(100, Math.round((referralStats.completed / referralStats.nextTier.minReferrals) * 100))}%` }}
                />
              </div>
            </div>
          )}

          {referralLoading && <p className="gp-referral-stats__loading">…</p>}
        </div>
      )}

      <div className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 p-4 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mb-3">
          <Gift className="w-7 h-7 text-emerald-400" />
        </div>
        <p className="gp-text font-bold text-base">{cm.referralPerFriend(referralConfig.baseRewardGat)}</p>
        <p className="gp-muted text-xs mt-1">{cm.referralKycRequired(referralConfig.requireKycTier)}</p>
      </div>

      <div className="gp-glass border rounded-2xl p-4 border-emerald-500/20">
        <p className="gp-muted text-[10px] uppercase tracking-widest mb-2">{cm.referralYourCode}</p>
        <div className="flex items-center gap-2 p-3 rounded-xl gp-subtle border">
          <span className={`gp-text text-sm gp-num font-bold flex-1 text-center tracking-wide ${!usageEnabled ? "opacity-50" : ""}`}>{referralCode}</span>
          <button
            type="button"
            disabled={!usageEnabled}
            onClick={() => usageEnabled ? copyText(referralCode, t.common.referralCode) : handleLockedAction()}
            className="text-emerald-400 p-1.5 flex items-center gap-1 text-xs font-semibold shrink-0 disabled:opacity-40"
          >
            <Copy className="w-4 h-4" /> {t.common.copy}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            type="button"
            disabled={!usageEnabled}
            onClick={() => void handleShareReferral()}
            className="py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:from-slate-600 disabled:to-slate-600 disabled:text-slate-300"
          >
            <Share2 className="w-3.5 h-3.5" /> {cm.shareReferral}
          </button>
          <button
            type="button"
            onClick={() => openToolPanel("referral-dashboard")}
            className="py-2.5 rounded-xl border border-fuchsia-500/30 text-fuchsia-300 text-xs font-semibold"
          >
            Dashboard
          </button>
        </div>
      </div>

      <div>
        <p className="gp-muted text-[10px] uppercase tracking-widest mb-2 px-1">{cm.referralStepsLabel}</p>
        <div className="grid grid-cols-2 gap-2">
          {steps.map((s) => (
            <div key={s.n} className="rounded-xl border gp-glass p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black flex items-center justify-center">{s.n}</span>
                <span className="text-emerald-400">{s.icon}</span>
              </div>
              <p className="gp-text text-[11px] font-medium leading-snug">{s.title}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
        <p className="gp-text text-xs font-semibold mb-2">{cm.referralTiersTitle}</p>
        <div className="space-y-1.5">
          {tierRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between text-[11px] gap-2">
              <span className="gp-muted">{row.label}</span>
              <span className={`gp-num font-bold shrink-0 ${row.isBonus ? "text-amber-400" : "text-emerald-400"}`}>
                {row.reward}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="gp-muted text-[10px] text-center leading-relaxed px-2">{cm.referralDashboardHint}</p>
    </div>
  );
};

const LearnPanel = ({ onOpenCourse }: { onOpenCourse: (idx: number) => void }) => {
  const { t } = useLanguage();
  const cm = t.community;
  const courseTags = ["Beginner", "Intermediate", "Advanced", "Essential"] as const;
  const courseIcons = [
    <BookOpen className="w-4 h-4" />,
    <Handshake className="w-4 h-4" />,
    <Globe className="w-4 h-4" />,
    <Calculator className="w-4 h-4" />,
  ];

  return (
    <div className="space-y-4">
      <InfoBox title={cm.educationHub} info={cm.learnInfo} accent="indigo" />
      <p className="gp-muted text-[11px] px-1">{cm.learnSubtitle}</p>

      <div className="space-y-3">
        {cm.courses.map((title, idx) => {
          const guide = cm.courseGuides[idx];
          return (
            <div key={title} className="gp-glass border rounded-2xl overflow-hidden border-indigo-500/15">
              <button
                type="button"
                onClick={() => onOpenCourse(idx)}
                className="w-full p-3.5 flex items-center gap-3 hover:bg-white/[0.02] transition-all text-left"
              >
                <div className="w-9 h-9 rounded-xl gp-subtle flex items-center justify-center gp-muted shrink-0">{courseIcons[idx]}</div>
                <div className="flex-1 min-w-0">
                  <p className="gp-text text-sm font-medium leading-tight">{title}</p>
                  <p className="gp-muted text-[10px] mt-1 line-clamp-2 leading-snug">{cm.courseDesc[idx]}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full mt-1.5 inline-block ${
                    courseTags[idx] === "Beginner" ? "bg-emerald-500/15 text-emerald-400"
                      : courseTags[idx] === "Intermediate" ? "bg-amber-500/15 text-amber-400"
                      : courseTags[idx] === "Advanced" ? "bg-red-500/15 text-red-400"
                      : "bg-indigo-500/15 text-indigo-400"
                  }`}>{cm.tags[courseTags[idx]]} ◈ {cm.courseDuration(COURSE_DURATIONS[idx])}</span>
                </div>
                <ChevronRight className="w-4 h-4 gp-muted shrink-0" />
              </button>

              <div className="px-3.5 pb-3.5 space-y-2 border-t gp-divider pt-3 mx-3.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <BookMarked className="w-3.5 h-3.5 text-indigo-400" />
                  <p className="gp-text text-[11px] font-semibold">{cm.courseGuideLabel}</p>
                </div>
                <div>
                  <p className="text-[10px] text-indigo-400/90 font-semibold mb-1 flex items-center gap-1">
                    <ListChecks className="w-3 h-3" /> {cm.courseObjectivesLabel}
                  </p>
                  <ul className="space-y-1">
                    {guide.objectives.map((obj) => (
                      <li key={obj} className="gp-muted text-[10px] leading-snug flex gap-1.5">
                        <span className="text-indigo-400 shrink-0">•</span>
                        <span>{obj}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] text-indigo-400/90 font-semibold mb-1">{cm.courseSectionsLabel}</p>
                  <div className="space-y-1.5">
                    {guide.sections.slice(0, 2).map((sec, si) => (
                      <div key={sec.title} className="rounded-lg gp-subtle px-2.5 py-2">
                        <p className="gp-text text-[10px] font-semibold">{si + 1}. {sec.title}</p>
                        <p className="gp-muted text-[9px] mt-0.5 line-clamp-2 leading-snug">{sec.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenCourse(idx)}
                  className="w-full py-2 rounded-xl border border-indigo-500/30 text-indigo-400 text-[11px] font-semibold flex items-center justify-center gap-1.5"
                >
                  <BookOpen className="w-3.5 h-3.5" /> {cm.courseViewGuide}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const CharityPanel = ({ funds }: { funds: CommunityFundsPublicSummary | null }) => {
  const { showToast, requireKyc, communityConfig, donateCharity } = useApp();
  const { t } = useLanguage();
  const cm = t.community;
  const presets = communityConfig.charity.presetAmountsGat;
  const [donateAmount, setDonateAmount] = useState(String(presets[1] ?? 50));
  const [donating, setDonating] = useState(false);

  const donateUsd = donateAmount ? tokenToUsd(parseFloat(donateAmount) || 0, "GAT").toFixed(2) : "0.00";
  const feeEst = communityConfig.charity.protocolFeeBps > 0
    ? ((parseFloat(donateAmount || "0") * communityConfig.charity.protocolFeeBps) / 10_000).toFixed(4)
    : "0";
  const netEst = communityConfig.charity.protocolFeeBps > 0
    ? (parseFloat(donateAmount || "0") * (1 - communityConfig.charity.protocolFeeBps / 10_000)).toFixed(4)
    : donateAmount || "0";

  const handleDonate = async () => {
    if (!communityConfig.charity.enabled) {
      showToast("Donasi sedang dinonaktifkan admin", "warning");
      return;
    }
    const amt = parseFloat(donateAmount);
    if (!amt || amt <= 0) { showToast(t.toast.zakatEnter, "error"); return; }
    if (!requireKyc(t.toast.kycRequired)) return;
    setDonating(true);
    const ok = await donateCharity(amt);
    setDonating(false);
    if (ok) setDonateAmount(String(presets[1] ?? 50));
  };

  return (
    <div className="space-y-4">
      <CommunityFundBanner kind="charity" funds={funds} />
      <InfoBox title={cm.charitySadaqah} info={cm.charityInfo} accent="red" />
      <p className="gp-muted text-[11px] px-1 leading-relaxed">{cm.charityHowItWorks}</p>
      <p className="text-[10px] text-red-400/70 px-1 flex items-center gap-1">
        <HandHeart className="w-3 h-3" /> {cm.charityPartners}
      </p>

      <div className="gp-glass border rounded-2xl p-4 border-red-500/15">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
              <Heart className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="gp-text font-semibold text-sm">{cm.charityTitle}</p>
              <p className="gp-muted text-xs mt-0.5">{cm.charityDesc}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setDonateAmount(String(p))}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold gp-num transition-all ${
                donateAmount === String(p) ? "gp-pill-active" : "gp-pill"
              }`}
            >
              {p} GAT
            </button>
          ))}
        </div>

        <label className="text-xs gp-muted mb-1.5 block">{cm.donateCustom}</label>
        <input
          type="number"
          value={donateAmount}
          onChange={(e) => setDonateAmount(e.target.value)}
          placeholder={cm.donatePlaceholder}
          className="w-full px-4 py-3 rounded-xl gp-input border text-sm gp-num mb-2"
        />
        <p className="gp-muted text-[10px] mb-1">{cm.donateUsdEst}: <span className="gp-num text-emerald-400">${donateUsd}</span></p>
        {communityConfig.charity.protocolFeeBps > 0 && (
          <p className="gp-muted text-[10px] mb-3">
            Protocol fee: ~{feeEst} GAT ({communityConfig.charity.protocolFeeBps} bps) · Net ke dana sadaqah: ~{netEst} GAT
          </p>
        )}
        <button
          type="button"
          onClick={handleDonate}
          disabled={donating || !communityConfig.charity.enabled}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm disabled:opacity-50"
        >
          {donating ? "…" : cm.donate}
        </button>
      </div>
    </div>
  );
};

export const CommunityScreen = () => {
  const { showToast, communityTab, setCommunityTab, refreshPlatformPrograms, referralConfig } = useApp();
  const { t } = useLanguage();
  const cm = t.community;
  const tab = communityTab;
  const setTab = setCommunityTab;
  const referralVisible = isReferralProgramVisible(referralConfig);
  const [activeCourse, setActiveCourse] = useState<number | null>(null);
  const [communityFunds, setCommunityFunds] = useState<CommunityFundsPublicSummary | null>(null);

  useEffect(() => {
    void refreshPlatformPrograms();
  }, [refreshPlatformPrograms]);

  useEffect(() => {
    if (!referralVisible && tab === "referral") setTab("overview");
  }, [referralVisible, tab, setTab]);

  useEffect(() => {
    fetchCommunityFundsSummary().then(setCommunityFunds);
  }, [tab]);

  const courseTags = ["Beginner", "Intermediate", "Advanced", "Essential"] as const;

  const tabs: { id: CommunityTab; label: string }[] = [
    { id: "overview", label: cm.tabs.overview },
    { id: "feed", label: cm.tabs.feed },
    { id: "zakat", label: cm.tabs.zakat },
    ...(referralVisible ? [{ id: "referral" as CommunityTab, label: cm.tabs.referral }] : []),
    { id: "learn", label: cm.tabs.learn },
    { id: "charity", label: cm.tabs.charity },
  ];

  return (
    <div className="space-y-4 pb-2">
      <div>
        <h2 className="gp-text font-bold text-lg">{t.screens.community}</h2>
        <p className="gp-muted text-xs">{cm.subtitle}</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
              tab === tb.id ? "gp-pill-active" : "gp-pill"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewPanel onNavigate={setTab} />}
      {tab === "feed" && <CommunitySocialFeed />}
      {tab === "zakat" && <ZakatPanel funds={communityFunds} />}
      {tab === "referral" && <ReferralPanel />}
      {tab === "learn" && <LearnPanel onOpenCourse={setActiveCourse} />}
      {tab === "charity" && <CharityPanel funds={communityFunds} />}

      <AnimatePresence>
        {activeCourse !== null && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 gp-overlay-panel z-50"
              onClick={() => setActiveCourse(null)}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280 }}
              className="fixed bottom-0 left-0 right-0 z-50 gp-modal-sheet border-t rounded-t-3xl mx-auto max-w-lg max-h-[88vh] flex flex-col"
            >
              <div className="gp-modal-handle w-10 h-1 rounded-full mx-auto mt-3 mb-2 shrink-0" />
              <div className="gp-panel-header flex items-start justify-between gap-3 px-5 pb-0 shrink-0">
                <div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    courseTags[activeCourse] === "Beginner" ? "bg-emerald-500/15 text-emerald-400" : "bg-indigo-500/15 text-indigo-400"
                  }`}>{cm.tags[courseTags[activeCourse]]}</span>
                  <h3 className="gp-text font-bold text-base mt-2">{cm.courses[activeCourse]}</h3>
                  <p className="gp-muted text-xs mt-1">{cm.courseDuration(COURSE_DURATIONS[activeCourse])}</p>
                </div>
                <button type="button" onClick={() => setActiveCourse(null)} className="gp-muted p-1"><X className="w-5 h-5" /></button>
              </div>

              <div className="gp-panel-body px-5 pb-5 space-y-4" style={{ scrollbarWidth: "none" }}>
                <p className="gp-muted text-sm leading-relaxed">{cm.courseDesc[activeCourse]}</p>

                <div>
                  <p className="gp-text text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <ListChecks className="w-4 h-4 text-indigo-400" /> {cm.courseObjectivesLabel}
                  </p>
                  <ul className="space-y-1.5">
                    {cm.courseGuides[activeCourse].objectives.map((obj) => (
                      <li key={obj} className="flex gap-2 text-xs gp-muted leading-relaxed">
                        <span className="text-indigo-400 shrink-0 mt-0.5">✓</span>
                        {obj}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="gp-text text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <BookMarked className="w-4 h-4 text-indigo-400" /> {cm.courseSectionsLabel}
                  </p>
                  <div className="space-y-2">
                    {cm.courseGuides[activeCourse].sections.map((sec, si) => (
                      <div key={sec.title} className="rounded-xl border gp-glass p-3">
                        <p className="gp-text text-xs font-semibold">{si + 1}. {sec.title}</p>
                        <p className="gp-muted text-[11px] mt-1.5 leading-relaxed">{sec.content}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
                  <p className="gp-text text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <Lightbulb className="w-4 h-4 text-amber-400" /> {cm.courseKeyPointsLabel}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {cm.courseGuides[activeCourse].keyPoints.map((pt) => (
                      <span key={pt} className="text-[10px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-400 font-medium">{pt}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-5 py-4 border-t gp-divider shrink-0">
                <button
                  type="button"
                  onClick={() => showToast(cm.courseNotAvailable, "warning")}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" /> {cm.courseStart}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
