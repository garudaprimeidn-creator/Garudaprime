import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Fingerprint, Lock, CheckCircle, ChevronRight, ChevronLeft,
  RefreshCw, ShieldCheck, User, Mail, Phone, Globe, Key, Wallet,
} from "lucide-react";
import { useLanguage } from "../../app/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import { showAppToast } from "../../app/appToast";
import { resolveFirebaseAuthToast } from "../../lib/firebase/authErrors";
import { formatAddress, type ConnectedWallet, resolvePreferredWalletProvider } from "../../lib/web3/walletService";
import { RegistrationWalletSetup, type RegistrationWalletChoice } from "./RegistrationWalletSetup";
import { GarudaWalletOtpModal } from "./GarudaWalletOtpModal";
import {
  persistRegistrationStep,
  readRegistrationStep,
  readAccountPreview,
  persistResidenceCountry,
  readResidenceCountry,
  readRegistrationWallet,
  clearRegistrationWallet,
  markRegistrationWalletLinked,
  type RegistrationSetupStep,
} from "../../lib/auth/accountSetup";
import { bootstrapRegistrationWallet, probeGarudaPrimeWallet } from "../../lib/auth/registrationWalletBootstrap";
import { RESIDENCE_COUNTRIES, countryLabel, detectDefaultCountryCode } from "../../lib/kyc/countries";
import { SelectionPills } from "../kyc/SelectionPills";
import { pickText } from "../../lib/auth/userFields";
import { PremiumAuthBackground } from "./SplashScreen";
import { AuthLogoHeader } from "./AuthLogoHeader";
import { RegistrationKycStep } from "./RegistrationKycStep";
import { RegistrationKycIntro } from "./RegistrationKycIntro";
import { AccountConfirmSkeleton } from "./components/AccountConfirmSkeleton";

const GlassCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`gp-auth-luxe-panel rounded-2xl ${className}`}>{children}</div>
);

const STEPS = ["basic", "region", "wallet", "kyc-intro", "kyc", "security", "success"] as const;
type Step = typeof STEPS[number];

const SETUP_STEPS = ["basic", "region", "wallet", "kyc-intro", "kyc", "security"] as const;

const isSetupStep = (step: Step): step is RegistrationSetupStep =>
  SETUP_STEPS.includes(step as RegistrationSetupStep);

export const RegistrationFlow = () => {
  const { t, lang } = useLanguage();
  const reg = t.registration;
  const authFields = t.auth.fields;
  const toast = t.toast as Record<string, string>;
  const {
    user, userProfile, completeRegistration, loading, sessionRestoring, enterApp,
    emailVerificationPending, resendVerificationEmail, refreshEmailVerification, canResendEmailVerification,
    signOut, linkWeb3Wallet, linkEmbeddedGarudaWallet, connectedWallet, walletAuthStep,
  } = useAuth();
  const [step, setStepState] = useState<Step>(() => readRegistrationStep() ?? "basic");
  const [walletMode, setWalletMode] = useState<"otp" | "external">("otp");
  const [otpWalletOpen, setOtpWalletOpen] = useState(false);
  const [hasGarudaPrimeWallet, setHasGarudaPrimeWallet] = useState(false);
  const garudaAutoLinkRef = React.useRef(false);
  const [walletAddress, setWalletAddress] = useState(() =>
    readRegistrationWallet()
    ?? "",
  );
  const walletBootstrapRef = React.useRef(
    Boolean(readRegistrationWallet()?.startsWith("0x")),
  );
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletResolving, setWalletResolving] = useState(false);
  const [replacingWallet, setReplacingWallet] = useState(false);
  const [kycDone, setKycDone] = useState(false);
  const [biometric, setBiometric] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const [pin, setPin] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [residenceCountry, setResidenceCountry] = useState(
    () => readResidenceCountry() ?? detectDefaultCountryCode(),
  );

  const setStep = (next: Step) => {
    if (isSetupStep(next)) persistRegistrationStep(next);
    setStepState(next);
  };

  React.useEffect(() => {
    if (step !== "wallet" || replacingWallet) return;
    setWalletResolving(false);
  }, [step, replacingWallet]);

  const resolvedWalletAddress = walletAddress.trim();
  const isWalletConnected = Boolean(
    !replacingWallet && resolvedWalletAddress.startsWith("0x"),
  );

  const walletConnectInProgress = walletBusy
    || (step === "wallet" && !isWalletConnected && walletAuthStep !== "idle");

  const accountPreview = readAccountPreview(user?.uid);
  const countryOptions = React.useMemo(
    () => RESIDENCE_COUNTRIES.map((c) => ({
      value: c.code,
      label: `${countryLabel(c.code, lang)} (${c.code})`,
    })),
    [lang],
  );
  const displayName = pickText(user?.displayName, userProfile?.fullName, accountPreview?.displayName);
  const displayEmail = pickText(user?.email, userProfile?.email, accountPreview?.email);
  const displayPhone = pickText(user?.phone, userProfile?.phone, accountPreview?.phone);
  const accountLoading = sessionRestoring && !displayName && !displayEmail && !accountPreview;

  const stepIndex = SETUP_STEPS.indexOf(step as (typeof SETUP_STEPS)[number]);

  React.useEffect(() => {
    if (step !== "wallet" || replacingWallet) {
      if (replacingWallet) {
        setWalletResolving(false);
        garudaAutoLinkRef.current = false;
      }
      return;
    }

    let cancelled = false;
    setWalletResolving(true);

    void (async () => {
      const garudaExists = await probeGarudaPrimeWallet(user?.uid);
      if (!cancelled) setHasGarudaPrimeWallet(garudaExists);

      const cached = readRegistrationWallet()?.trim();
      if (cached?.startsWith("0x")) {
        if (!cancelled) {
          setWalletAddress((prev) => (prev.toLowerCase() === cached.toLowerCase() ? prev : cached));
          walletBootstrapRef.current = true;
          garudaAutoLinkRef.current = true;
          if (connectedWallet?.address?.toLowerCase() === cached.toLowerCase()) {
            setWalletMode(
              connectedWallet.provider?.includes("garuda") || connectedWallet.provider?.includes("embedded")
                ? "otp"
                : "external",
            );
          }
          setWalletResolving(false);
        }
        return;
      }

      const boot = await bootstrapRegistrationWallet(user?.uid, userProfile, connectedWallet);
      if (cancelled) return;

      if (boot?.isGarudaPrime && user?.uid && !garudaAutoLinkRef.current) {
        const sessionReady = connectedWallet?.address?.toLowerCase() === boot.address.toLowerCase()
          && (connectedWallet.provider?.includes("garuda") || connectedWallet.provider?.includes("embedded"));

        if (sessionReady) {
          garudaAutoLinkRef.current = true;
          setWalletAddress(boot.address);
          setWalletMode("otp");
          markRegistrationWalletLinked(boot.address);
          walletBootstrapRef.current = true;
          if (!cancelled) setWalletResolving(false);
          return;
        }

        garudaAutoLinkRef.current = true;
        setWalletBusy(true);
        try {
          const wallet = await linkEmbeddedGarudaWallet();
          if (!cancelled) {
            setWalletAddress(wallet.address);
            setWalletMode("otp");
            markRegistrationWalletLinked(wallet.address);
            walletBootstrapRef.current = true;
          }
        } catch {
          if (!cancelled && boot) {
            setWalletAddress(boot.address);
            setWalletMode("otp");
            markRegistrationWalletLinked(boot.address);
            walletBootstrapRef.current = true;
          }
        } finally {
          setWalletBusy(false);
        }
      } else if (boot) {
        setWalletAddress(boot.address);
        setWalletMode(boot.mode);
        walletBootstrapRef.current = true;
      } else if (!walletBootstrapRef.current) {
        setWalletAddress("");
      }
      if (!cancelled) setWalletResolving(false);
    })();

    return () => {
      cancelled = true;
      setWalletBusy(false);
    };
  }, [
    step,
    replacingWallet,
    user?.uid,
    userProfile?.walletAddress,
    connectedWallet?.address,
    connectedWallet?.provider,
    linkEmbeddedGarudaWallet,
  ]);

  const handleBack = async () => {
    if (step === "basic") {
      await signOut();
      return;
    }
    if (step === "wallet") setStep("region");
    else if (step === "region") setStep("basic");
    else if (step === "kyc-intro") setStep("wallet");
    else if (step === "kyc") setStep("kyc-intro");
    else if (step === "security") setStep(kycDone ? "kyc" : "kyc-intro");
  };

  const onWalletLinked = (w: ConnectedWallet, mode: "otp" | "external") => {
    setReplacingWallet(false);
    walletBootstrapRef.current = true;
    setWalletMode(mode);
    setWalletAddress(w.address);
    markRegistrationWalletLinked(w.address);
    setOtpWalletOpen(false);
    setStep("kyc-intro");
  };

  const handleWalletChoice = async (choice: RegistrationWalletChoice) => {
    if (choice === "otp") {
      setOtpWalletOpen(true);
      return;
    }
    setWalletBusy(true);
    try {
      const provider = resolvePreferredWalletProvider();
      const wallet = await linkWeb3Wallet(provider, { makePrimary: true });
      onWalletLinked(wallet, "external");
      showAppToast(t.auth.walletconnect.walletLinked ?? "Dompet terhubung", "success");
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e
        ? String((e as { code: string }).code)
        : "";
      if (code === "wallet/user-rejected" || code.includes("cancel")) return;
      showAppToast(resolveFirebaseAuthToast(e, toast), "error");
    } finally {
      setWalletBusy(false);
    }
  };

  const handleWalletLoginInstead = async () => {
    await signOut();
  };

  const handleConnectWallet = () => {
    if (isWalletConnected) {
      setStep("kyc-intro");
    }
  };

  const handleFinish = async () => {
    if (pin.length < 4) {
      showAppToast(reg.pinSetupHint ?? toast.passwordMin6 ?? "PIN minimal 4 digit", "error");
      return;
    }
    const finalWallet = walletAddress.trim() || readRegistrationWallet();
    if (!finalWallet?.startsWith("0x")) {
      showAppToast(
        lang === "id"
          ? "Hubungkan dompet terlebih dahulu"
          : "Connect a wallet first",
        "error",
      );
      setStep("wallet");
      return;
    }
    setFinishing(true);
    try {
      await completeRegistration({
        walletMode,
        walletAddress: finalWallet,
        kycCompleted: kycDone,
        biometricEnabled: biometric,
        pin,
        twoFactorEnabled: twoFactor,
      });
      setStep("success");
    } catch (e) {
      showAppToast(resolveFirebaseAuthToast(e, toast), "error");
    } finally {
      setFinishing(false);
    }
  };

  const handleResendVerification = async () => {
    if (!canResendEmailVerification) {
      showAppToast(toast.authEmailResendUnavailable ?? toast.authSessionRequired, "warning");
      return;
    }
    try {
      await resendVerificationEmail();
      showAppToast(toast.emailVerificationSent, "success");
    } catch (e) {
      showAppToast(resolveFirebaseAuthToast(e, toast), "error");
    }
  };

  const handleCheckVerification = async () => {
    const verified = await refreshEmailVerification();
    showAppToast(verified ? toast.emailVerified : toast.emailNotVerified, verified ? "success" : "warning");
  };

  React.useEffect(() => {
    if (step !== "success") return;
    const timer = setTimeout(enterApp, 850);
    return () => clearTimeout(timer);
  }, [step, enterApp]);

  if (step === "kyc-intro") {
    return (
      <RegistrationKycIntro
        walletAddress={resolvedWalletAddress || undefined}
        onStart={() => setStep("kyc")}
        onSkip={() => setStep("security")}
        onBack={() => setStep("wallet")}
      />
    );
  }

  if (step === "kyc") {
    return (
      <div className="relative flex flex-1 flex-col overflow-hidden gp-auth-scene gp-auth-luxe min-h-0">
        <RegistrationKycStep
          onComplete={(submitted) => {
            if (submitted) setKycDone(true);
            setStep("security");
          }}
          onBack={() => setStep("kyc-intro")}
        />
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden gp-auth-scene gp-auth-luxe px-6">
        <PremiumAuthBackground />
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="relative text-center space-y-6">
          <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            className="w-24 h-24 mx-auto rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <ShieldCheck className="w-10 h-10 text-emerald-400" />
          </motion.div>
          <div>
            <h2 className="gp-auth-luxe-title text-2xl">{reg.welcomeTitle}</h2>
            <p className="gp-auth-luxe-desc mt-2 max-w-[280px] mx-auto">{reg.welcomeSubtitle}</p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-emerald-400 text-sm font-semibold">{reg.allSet}</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden gp-auth-scene gp-auth-luxe">
      <PremiumAuthBackground />
      <GarudaWalletOtpModal
        open={otpWalletOpen}
        onClose={() => setOtpWalletOpen(false)}
        onSuccess={(wallet) => {
          onWalletLinked(wallet, "otp");
          showAppToast(t.auth.walletconnect.walletLinked ?? "Dompet terhubung", "success");
        }}
        onError={(e) => showAppToast(resolveFirebaseAuthToast(e, toast), "error")}
      />

      <div className="relative px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <motion.button
          type="button"
          onClick={handleBack}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label={step === "basic" ? reg.backToLogin : reg.back}
          className="absolute left-6 top-[max(1rem,env(safe-area-inset-top))] z-10 w-10 h-10 flex items-center justify-center rounded-full gp-auth-skip gp-auth-skip--luxe"
        >
          <ChevronLeft className="w-5 h-5" />
        </motion.button>
        <AuthLogoHeader size={56} />
        <div className="flex items-center gap-1 mt-4 mb-1">
          {SETUP_STEPS.map((s, i) => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${i < stepIndex ? "bg-emerald-500" : "bg-[rgba(var(--lx-line),0.35)]"}`} />
          ))}
        </div>
        <p className="gp-auth-luxe-kicker text-[10px] text-center">{reg.stepOf(stepIndex + 1, SETUP_STEPS.length)}</p>
      </div>

      <div className="relative flex-1 overflow-y-auto px-6 pb-8" style={{ scrollbarWidth: "none" }}>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="space-y-4 pt-2">

            {step === "basic" && (
              <>
                <div className="gp-auth-luxe-heading text-center mb-2">
                  <h2 className="gp-auth-luxe-title gp-auth-luxe-title--page">{reg.basicTitle}</h2>
                  <p className="gp-auth-luxe-desc gp-auth-luxe-desc--page mt-2">{reg.basicSubtitle}</p>
                </div>
                <GlassCard className="p-4 space-y-3">
                  {accountLoading ? (
                    <AccountConfirmSkeleton />
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <User className="w-4 h-4 gp-auth-accent-gold shrink-0" />
                        <div>
                          <p className="gp-auth-label text-[10px]">{authFields.fullName.label}</p>
                          <p className="gp-text text-sm font-medium">{displayName ?? "N/A"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Mail className="w-4 h-4 gp-auth-accent-gold shrink-0" />
                        <div>
                          <p className="gp-auth-label text-[10px]">{authFields.email.label}</p>
                          <p className="gp-text text-sm font-medium">{displayEmail ?? "N/A"}</p>
                        </div>
                      </div>
                      {displayPhone && (
                        <div className="flex items-center gap-3">
                          <Phone className="w-4 h-4 gp-auth-accent-gold shrink-0" />
                          <div>
                            <p className="gp-auth-label text-[10px]">{authFields.phone.label}</p>
                            <p className="gp-text text-sm font-medium">{displayPhone}</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </GlassCard>
                {emailVerificationPending && displayEmail && (
                  <GlassCard className="p-4 space-y-3 border border-amber-500/25 bg-amber-500/5">
                    <p className="text-sm gp-text font-medium">{reg.emailVerifyTitle}</p>
                    <p className="text-xs gp-muted leading-relaxed">{reg.emailVerifyBody(displayEmail)}</p>
                    <div className="flex gap-2">
                      {canResendEmailVerification ? (
                        <button type="button" onClick={handleResendVerification} disabled={loading}
                          className="flex-1 py-2.5 rounded-xl text-xs font-semibold gp-auth-btn-secondary gp-auth-btn-secondary--luxe disabled:opacity-60">
                          {reg.emailVerifyResend}
                        </button>
                      ) : (
                        <p className="flex-1 text-[10px] gp-muted leading-relaxed py-2">
                          {reg.emailVerifyResendHint ?? "Buka inbox, link verifikasi sudah dikirim saat pendaftaran."}
                        </p>
                      )}
                      <button type="button" onClick={handleCheckVerification} disabled={loading}
                        className="flex-1 py-2.5 rounded-xl text-xs font-semibold gp-auth-btn gp-auth-btn--luxe disabled:opacity-60">
                        {reg.emailVerifyCheck}
                      </button>
                    </div>
                  </GlassCard>
                )}
                <button type="button" onClick={() => setStep("region")} disabled={accountLoading}
                  className="gp-auth-btn gp-auth-btn--luxe w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                  {reg.continueBtn} <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}

            {step === "region" && (
              <>
                <div className="gp-auth-luxe-heading">
                  <h2 className="gp-auth-luxe-title gp-auth-luxe-title--page">{reg.regionTitle}</h2>
                  <p className="gp-auth-luxe-desc gp-auth-luxe-desc--page mt-2">{reg.regionSubtitle}</p>
                </div>
                <GlassCard className="p-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <Globe className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <p className="gp-muted text-xs leading-relaxed">{reg.regionCompliance}</p>
                  </div>
                  <div>
                    <label className="gp-auth-label mb-1.5 block">{reg.regionCountryLabel}</label>
                    <SelectionPills
                      options={countryOptions}
                      value={residenceCountry}
                      onChange={setResidenceCountry}
                    />
                  </div>
                </GlassCard>
                <button
                  type="button"
                  onClick={() => {
                    persistResidenceCountry(residenceCountry);
                    setStep("wallet");
                  }}
                  className="gp-auth-btn gp-auth-btn--luxe w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
                >
                  {reg.continueBtn} <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}

            {step === "wallet" && (
              <>
                <div className="gp-auth-luxe-heading">
                  <h2 className="gp-auth-luxe-title gp-auth-luxe-title--page">{reg.walletTitle}</h2>
                  <p className="gp-auth-luxe-desc gp-auth-luxe-desc--page mt-2">
                    {isWalletConnected
                      ? reg.walletConnectedHint
                      : hasGarudaPrimeWallet
                        ? (reg.walletGarudaReconnectHint ?? reg.walletConnectedHint)
                        : (reg.walletGarudaFirstHint ?? reg.walletSubtitle)}
                  </p>
                </div>

                {walletResolving && !isWalletConnected ? (
                  <GlassCard className="p-8 flex flex-col items-center justify-center gap-3">
                    <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                    <p className="gp-muted text-xs text-center">{reg.walletChecking ?? "Memeriksa dompet terhubung…"}</p>
                  </GlassCard>
                ) : isWalletConnected ? (
                  <div className="space-y-4">
                    <GlassCard className="p-4 flex items-center gap-3 border border-emerald-500/30 bg-emerald-500/10">
                      <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                        <CheckCircle className="w-6 h-6 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="gp-muted text-[10px]">
                          {walletMode === "otp"
                            ? (reg.walletInternalTitle ?? reg.walletConnected)
                            : reg.walletConnected}
                        </p>
                        <p className="gp-num gp-text text-sm font-semibold truncate">
                          {formatAddress(resolvedWalletAddress)}
                        </p>
                      </div>
                    </GlassCard>
                    <button
                      type="button"
                      onClick={() => void handleConnectWallet()}
                      disabled={walletBusy}
                      className="gp-auth-btn gp-auth-btn--luxe w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {walletBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                      {reg.continueBtn}
                      {!walletBusy && <ChevronRight className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        walletBootstrapRef.current = false;
                        setReplacingWallet(true);
                        setWalletAddress("");
                        clearRegistrationWallet();
                      }}
                      disabled={walletBusy}
                      className="w-full text-center text-xs gp-muted py-2 underline-offset-2 hover:underline disabled:opacity-60"
                    >
                      {reg.walletChange}
                    </button>
                  </div>
                ) : walletConnectInProgress && walletAuthStep !== "idle" ? (
                  <GlassCard className="p-8 flex flex-col items-center justify-center gap-3">
                    <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                    <p className="gp-muted text-xs text-center">
                      {t.auth.walletSteps[walletAuthStep === "signing" ? "sign" : walletAuthStep === "linking" ? "link" : "connect"]}
                    </p>
                  </GlassCard>
                ) : (
                  <RegistrationWalletSetup
                    onChoose={(choice) => void handleWalletChoice(choice)}
                    onWalletLoginInstead={() => void handleWalletLoginInstead()}
                    busy={walletConnectInProgress}
                    showExternalOption={replacingWallet || !hasGarudaPrimeWallet}
                  />
                )}
              </>
            )}

            {step === "security" && (
              <>
                <div className="gp-auth-luxe-heading">
                  <h2 className="gp-auth-luxe-title gp-auth-luxe-title--page">{reg.securityTitle}</h2>
                  <p className="gp-auth-luxe-desc gp-auth-luxe-desc--page mt-2">{reg.securitySubtitle}</p>
                </div>
                <GlassCard className="p-4 space-y-4">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Fingerprint className="w-5 h-5 text-emerald-400" />
                      <span className="gp-text text-sm">{reg.biometric}</span>
                    </div>
                    <input type="checkbox" checked={biometric} onChange={(e) => setBiometric(e.target.checked)} className="gp-auth-checkbox w-5 h-5 rounded" />
                  </label>
                  <div>
                    <label className="flex items-center gap-3 mb-2">
                      <Lock className="w-5 h-5 text-amber-400" />
                      <span className="gp-text text-sm">{reg.pinSetup}</span>
                    </label>
                    <p className="gp-muted text-[10px] mb-2 leading-relaxed">{reg.pinSetupHint}</p>
                    <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="••••••" className="w-full px-4 py-3 rounded-xl gp-input gp-auth-input border text-center text-xl gp-num tracking-[0.5em]" />
                  </div>
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Key className="w-5 h-5 text-cyan-400" />
                      <span className="gp-text text-sm">{reg.twoFactor}</span>
                    </div>
                    <input type="checkbox" checked={twoFactor} onChange={(e) => setTwoFactor(e.target.checked)} className="gp-auth-checkbox w-5 h-5 rounded" />
                  </label>
                </GlassCard>
                {resolvedWalletAddress && (
                  <GlassCard className="p-3 flex items-center gap-3">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                    <div>
                      <p className="gp-muted text-[10px]">{reg.walletConnected}</p>
                      <p className="gp-num gp-text text-sm font-semibold">{formatAddress(resolvedWalletAddress)}</p>
                    </div>
                  </GlassCard>
                )}
                <button type="button" onClick={handleFinish} disabled={loading || finishing || pin.length < 4}
                  className="gp-auth-btn gp-auth-btn--luxe w-full py-4 rounded-2xl font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                  {(loading || finishing) ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                  {reg.finishSetup}
                </button>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
