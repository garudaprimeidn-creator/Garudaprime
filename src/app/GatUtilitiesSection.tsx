import React from "react";
import {
  Globe, Shield, Lock, TrendingUp, Gift, Store, Crown, Bot, ShoppingBag, Coins,
} from "lucide-react";
import { useApp } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import { showAppToast } from "./appToast";
import {
  getGatUtilities, type GatUtilityId, type GatUtilityAction,
} from "./tokenUtilities";

const UTILITY_ICONS: Record<GatUtilityId, React.ReactNode> = {
  ecosystem_payment: <Globe className="w-4 h-4" />,
  halal_transaction: <Shield className="w-4 h-4" />,
  staking: <Lock className="w-4 h-4" />,
  investment_participation: <TrendingUp className="w-4 h-4" />,
  community_reward: <Gift className="w-4 h-4" />,
  merchant_payment: <Store className="w-4 h-4" />,
  premium_membership: <Crown className="w-4 h-4" />,
  ai_service_access: <Bot className="w-4 h-4" />,
  marketplace_payment: <ShoppingBag className="w-4 h-4" />,
};

export const useGatUtilityRunner = () => {
  const { setScreen, toggleOverlay, openScan, openProfile, setOverlay, openToolPanel } = useApp();
  const { t } = useLanguage();
  const te = t.tokenEconomy;

  return (action: GatUtilityAction, onClose?: () => void) => {
    onClose?.();
    switch (action) {
      case "screen:invest":
        setOverlay("none");
        setScreen("invest");
        break;
      case "screen:market":
        setOverlay("none");
        setScreen("market");
        break;
      case "screen:community":
        setOverlay("none");
        setScreen("community");
        break;
      case "scan:pay":
        openScan("pay");
        break;
      case "overlay:ai":
        toggleOverlay("ai");
        break;
      case "profile:subscription":
        openProfile("subscription");
        break;
      case "staking:demo":
        showAppToast(te.stakingDemo, "info");
        break;
      case "halal:info":
        setOverlay("none");
        setScreen("invest");
        break;
      case "ecosystem:info":
        setOverlay("none");
        setScreen("wallet");
        break;
      case "none":
        break;
    }
  };
};

export const GatUtilitiesSection = ({
  compact = false, onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) => {
  const { t } = useLanguage();
  const te = t.tokenEconomy;
  const runAction = useGatUtilityRunner();
  const utilities = getGatUtilities();

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {!compact && (
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-emerald-400" />
              <h3 className="gp-text font-semibold text-sm">{te.utilitiesTitle}</h3>
            </div>
            <p className="gp-muted text-[11px] mt-0.5 leading-snug">{te.utilitiesSubtitle}</p>
          </div>
          <span className="gp-badge-read gp-badge-read--emerald shrink-0 text-[10px]">
            {utilities.filter((u) => u.status === "active").length}/{utilities.length}
          </span>
        </div>
      )}

      <div className={`grid ${compact ? "grid-cols-2 gap-1.5" : "grid-cols-2 gap-2"}`}>
        {utilities.map((util) => {
          const u = te.utilities[util.id];
          const isFuture = util.status === "future";
          return (
            <button
              key={util.id}
              type="button"
              onClick={() => runAction(util.action, onNavigate)}
              className={`text-left rounded-xl border transition-all active:scale-[0.98] ${
                compact ? "p-2.5" : "p-3"
              } ${isFuture
                ? "gp-subtle border-dashed opacity-70"
                : "gp-glass hover:border-emerald-500/25 gp-hover-row"
              }`}
            >
              <div className="flex items-start justify-between gap-1 mb-1.5">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  isFuture ? "bg-zinc-500/10 text-zinc-400" : "bg-emerald-500/10 text-emerald-400"
                }`}>
                  {UTILITY_ICONS[util.id]}
                </span>
                {isFuture && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold">
                    {te.futureBadge}
                  </span>
                )}
              </div>
              <p className={`gp-text font-semibold leading-tight ${compact ? "text-[11px]" : "text-xs"}`}>
                {u.title}
              </p>
              {!compact && (
                <p className="gp-muted text-[10px] mt-0.5 leading-snug line-clamp-2">{u.desc}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
