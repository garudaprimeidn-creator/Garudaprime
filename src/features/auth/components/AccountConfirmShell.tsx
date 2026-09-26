import React from "react";
import { ChevronLeft } from "lucide-react";
import { useLanguage } from "../../../app/LanguageContext";
import { PremiumAuthBackground } from "../SplashScreen";
import { AuthLogoHeader } from "../AuthLogoHeader";
import { AccountConfirmSkeleton } from "./AccountConfirmSkeleton";

type Props = {
  showBack?: boolean;
  onBack?: () => void;
};

/**
 * Same chrome as RegistrationFlow step "basic", used while OAuth/session settles
 * so the transition does not look like a separate loading page.
 */
export const AccountConfirmShell = ({ showBack = false, onBack }: Props) => {
  const { t } = useLanguage();
  const reg = t.registration;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden gp-auth-scene gp-auth-luxe min-h-0">
      <PremiumAuthBackground />

      <div className="relative px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        {showBack && onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={reg.backToLogin}
            className="absolute left-6 top-[max(1rem,env(safe-area-inset-top))] z-10 flex h-10 w-10 items-center justify-center rounded-full gp-auth-skip gp-auth-skip--luxe"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <AuthLogoHeader size={56} />
        <div className="mb-1 mt-4 flex items-center gap-1">
          <div className="h-1 flex-1 rounded-full bg-emerald-500" />
          <div className="h-1 flex-1 rounded-full bg-[rgba(var(--lx-line),0.35)]" />
          <div className="h-1 flex-1 rounded-full bg-[rgba(var(--lx-line),0.35)]" />
          <div className="h-1 flex-1 rounded-full bg-[rgba(var(--lx-line),0.35)]" />
          <div className="h-1 flex-1 rounded-full bg-[rgba(var(--lx-line),0.35)]" />
          <div className="h-1 flex-1 rounded-full bg-[rgba(var(--lx-line),0.35)]" />
        </div>
        <p className="gp-auth-luxe-kicker text-center text-[10px]">{reg.stepOf(1, 6)}</p>
      </div>

      <div className="relative flex-1 overflow-y-auto px-6 pb-8" style={{ scrollbarWidth: "none" }}>
        <div className="space-y-4 pt-2">
          <div className="gp-auth-luxe-heading mb-2 text-center">
            <h2 className="gp-auth-luxe-title gp-auth-luxe-title--page">{reg.basicTitle}</h2>
            <p className="gp-auth-luxe-desc gp-auth-luxe-desc--page mt-2">{reg.basicSubtitle}</p>
          </div>
          <div className="gp-auth-luxe-panel rounded-2xl p-4">
            <AccountConfirmSkeleton />
          </div>
          <div
            className="gp-auth-btn gp-auth-btn--luxe flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold opacity-60"
            aria-hidden
          >
            {reg.continueBtn}
          </div>
        </div>
      </div>
    </div>
  );
};
