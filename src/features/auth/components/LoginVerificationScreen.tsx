import React, { useState } from "react";
import { motion } from "motion/react";
import {
  Mail, RefreshCw, CheckCircle2, ArrowRight, ChevronRight, ShieldCheck,
} from "lucide-react";
import { useLanguage } from "../../../app/LanguageContext";
import { useAuth } from "../../../contexts/AuthContext";
import { showAppToast } from "../../../app/appToast";
import { AuthLayout, GlassCard, AuthDivider, PrimaryAuthButton } from "./AuthLayout";
import { SecurityStatusCard } from "./SecurityStatusCard";
import { KycPortVerificationBlock } from "../../kyc/KycPortVerificationBlock";
import { isKycPortOAuthConfigured } from "../../../lib/kyc/kycportConfig";

const StepPill = ({
  number, label, active, done,
}: { number: number; label: string; active?: boolean; done?: boolean }) => (
  <div
    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
      done
        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
        : active
          ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/25"
          : "bg-white/5 gp-muted border border-white/8"
    }`}
  >
    <span
      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
        done ? "bg-emerald-500 text-black" : active ? "bg-emerald-500/25 text-emerald-300" : "bg-white/10"
      }`}
    >
      {done ? <CheckCircle2 className="h-3 w-3" /> : number}
    </span>
    <span>{label}</span>
  </div>
);

export const LoginVerificationScreen = () => {
  const { t } = useLanguage();
  const auth = t.auth;
  const toast = t.toast as Record<string, string>;
  const verify = t.loginVerify as Record<string, string>;
  const {
    user, loading, resendVerificationEmail, refreshEmailVerification,
    setPhase,
  } = useAuth();

  const [checking, setChecking] = useState(false);
  const [kycExpanded, setKycExpanded] = useState(false);

  const displayEmail = user?.email ?? "";
  const emailVerified = user?.emailVerified === true;

  const goToSetup = () => setPhase("register");

  const subtitle = displayEmail
    ? (verify.subtitleWithEmail ?? verify.subtitle).replace("{email}", displayEmail)
    : (verify.subtitle ?? "");

  const handleResend = async () => {
    try {
      await resendVerificationEmail();
      showAppToast(toast.emailVerificationSent, "success");
    } catch {
      showAppToast(toast.authFailed, "error");
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    try {
      const verified = await refreshEmailVerification();
      if (verified) {
        showAppToast(toast.emailVerified, "success");
        goToSetup();
      } else {
        showAppToast(toast.emailNotVerified, "warning");
      }
    } finally {
      setChecking(false);
    }
  };

  const busy = loading || checking;

  return (
    <AuthLayout
      title={verify.title ?? "Verify Your Login"}
      subtitle={subtitle}
      logoContext="auth"
    >
      <div className="flex items-center justify-center gap-2 px-1">
        <StepPill number={1} label={verify.stepEmail ?? "Email"} active={!emailVerified} done={emailVerified} />
        <ChevronRight className="h-3.5 w-3.5 shrink-0 gp-muted opacity-50" />
        <StepPill number={2} label={verify.stepSetup ?? "Setup"} active={emailVerified} />
      </div>

      <GlassCard
        className={`p-5 space-y-4 ${
          emailVerified
            ? "border border-emerald-500/30 bg-emerald-500/[0.04]"
            : "border border-amber-500/20"
        }`}
      >
        <div className="flex items-start gap-3">
          <motion.div
            animate={emailVerified ? undefined : { scale: [1, 1.04, 1] }}
            transition={{ duration: 2.5, repeat: emailVerified ? 0 : Infinity }}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
              emailVerified
                ? "gp-auth-luxe-icon gp-auth-luxe-icon--emerald"
                : "bg-amber-500/10 border border-amber-500/25"
            }`}
          >
            {emailVerified ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            ) : (
              <Mail className="h-6 w-6 text-amber-400/90" />
            )}
          </motion.div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold gp-text">
              {emailVerified ? (verify.emailDoneTitle ?? "Email terverifikasi") : verify.emailVerify}
            </p>
            {displayEmail && (
              <p className="mt-0.5 truncate text-xs font-medium text-emerald-400/90">{displayEmail}</p>
            )}
            <p className="mt-2 text-xs gp-muted leading-relaxed">
              {emailVerified ? (verify.emailDoneBody ?? verify.instructions) : verify.instructions}
            </p>
          </div>
        </div>

        {emailVerified ? (
          <PrimaryAuthButton onClick={goToSetup} disabled={busy}>
            <span className="flex items-center justify-center gap-2">
              {verify.continueSetup}
              <ArrowRight className="h-4 w-4" />
            </span>
          </PrimaryAuthButton>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={busy}
              className="gp-auth-btn-secondary gp-auth-btn-secondary--luxe flex-1 rounded-xl py-3 text-xs font-semibold disabled:opacity-60"
            >
              {auth.resendVerification ?? verify.resend}
            </button>
            <button
              type="button"
              onClick={() => void handleCheck()}
              disabled={busy}
              className="gp-auth-btn gp-auth-btn--luxe flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-bold disabled:opacity-60"
            >
              {checking ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {verify.checkVerified}
            </button>
          </div>
        )}
      </GlassCard>

      <SecurityStatusCard
        compact
        title={verify.securityTitle}
        items={[
          {
            id: "email",
            label: verify.emailVerify,
            description: displayEmail,
            enabled: emailVerified,
            icon: "shield",
          },
          {
            id: "session",
            label: verify.sessionSecure,
            enabled: true,
            icon: "lock",
          },
        ]}
      />

      {isKycPortOAuthConfigured() && (
        <div className="space-y-3">
          <AuthDivider label={verify.kycOptional ?? "Opsional"} />
          {!kycExpanded ? (
            <button
              type="button"
              onClick={() => setKycExpanded(true)}
              className="gp-auth-luxe-panel flex w-full items-center gap-3 rounded-2xl border border-white/8 p-4 text-left transition-colors hover:border-emerald-500/25"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                <ShieldCheck className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold gp-text">{verify.kycBlockTitle}</p>
                <p className="mt-0.5 text-[11px] gp-muted leading-relaxed">{verify.kycBlockSub}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 gp-muted" />
            </button>
          ) : (
            <KycPortVerificationBlock
              variant="auth"
              compact
              showManualDivider={false}
              onVerified={goToSetup}
            />
          )}
        </div>
      )}

      {!emailVerified && (
        <button
          type="button"
          onClick={goToSetup}
          className="flex w-full items-center justify-center gap-1.5 py-2 text-xs gp-muted"
        >
          {verify.skipForNow ?? verify.continueSetup}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}

      {!emailVerified && verify.skipHint && (
        <p className="px-2 text-center text-[10px] gp-muted leading-relaxed">{verify.skipHint}</p>
      )}
    </AuthLayout>
  );
};
