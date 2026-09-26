import React, { useState, useEffect } from "react";
import { Mail, CheckCircle, ShieldCheck } from "lucide-react";
import { useLanguage } from "../../app/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import { showAppToast } from "../../app/appToast";
import { firebaseAuthErrorKey, resolveFirebaseAuthToast } from "../../lib/firebase/authErrors";
import { validateRegisterForm, type RegisterFieldErrors } from "../../lib/auth/validation";
import { captureReferralFromUrl, getPendingReferralCode } from "../../lib/referral/referralRef";
import { isReferralProgramAvailable } from "../../lib/referral/referralProgramGate";
import { hideInstantAuthGate } from "../../lib/auth/authGateOverlay";
import { preloadGoogleSignIn } from "../../lib/firebase/googleSignInPwa";
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "../../lib/app/branding";
import { resolveKycPortOAuthReady } from "../../lib/kyc/kycportApi";
import { LoginWalletModal } from "./LoginWalletModal";
import {
  AuthLayout, GlassCard, AuthDivider, PrimaryAuthButton,
  LoginForm, SocialLoginButtons, ReferralInviteBanner, AuthProgressOverlay,
} from "./components";
import { KycPortAwaitingBanner } from "./KycPortAwaitingBanner";
type AuthView = "login" | "register" | "forgot";

export const AuthPage = () => {
  const { t } = useLanguage();
  const auth = t.auth;
  const toast = t.toast as Record<string, string>;
  const {
    loading, signIn, resetPassword, signInWithGoogle, signInWithApple, register,
    signInWithKycPort,
    kycportLoading,
    sessionRestoring,
  } = useAuth();

  const authBusy = loading || kycportLoading || sessionRestoring;

  const [view, setView] = useState<AuthView>("login");
  const [walletLoginOpen, setWalletLoginOpen] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [registerForm, setRegisterForm] = useState({ fullName: "", email: "", phone: "", password: "", referral: "" });
  const [registerErrors, setRegisterErrors] = useState<RegisterFieldErrors>({});

  const [kycPortOAuthReady, setKycPortOAuthReady] = useState(false);

  const referralActive = isReferralProgramAvailable();

  useEffect(() => {
    hideInstantAuthGate();
    if (!referralActive) return;
    captureReferralFromUrl();
    const pending = getPendingReferralCode();
    if (pending) {
      setReferralCode(pending);
      setRegisterForm((f) => ({ ...f, referral: pending }));
      setView("register");
    }
    preloadGoogleSignIn();
  }, [referralActive]);

  useEffect(() => {
    void resolveKycPortOAuthReady().then(setKycPortOAuthReady);
  }, []);

  const referralInvite = (auth as Record<string, unknown>).referralInvite as Record<string, string> | undefined;

  const toastError = (err: unknown) => {
    showAppToast(resolveFirebaseAuthToast(err, toast), "error");
  };

  const run = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { toastError(e); }
  };

  const handleLogin = () => run(async () => {
    if (!email.includes("@")) { showAppToast(toast.invalidEmail, "error"); return; }
    if (password.length < 6) { showAppToast(toast.passwordMin6, "error"); return; }
    await signIn(email.trim(), password, remember);
  });

  const handleForgotPassword = () => run(async () => {
    const target = forgotEmail.trim() || email.trim();
    if (!target.includes("@")) { showAppToast(toast.emailFirst, "error"); return; }
    await resetPassword(target);
    setForgotSent(true);
    showAppToast(toast.resetSent, "success");
  });

  const handleRegister = () => run(async () => {
    const errors = validateRegisterForm(registerForm);
    setRegisterErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstKey = Object.values(errors)[0];
      if (firstKey) showAppToast(toast[firstKey] ?? toast.authFailed, "error");
      return;
    }
    if (!termsAccepted) { showAppToast(toast.acceptTerms, "error"); return; }
    await register(registerForm);
  });

  const titles: Record<AuthView, { title: string; subtitle: string }> = {
    login: auth.login,
    register: auth.register,
    forgot: forgotSent ? auth.forgot.sentTitle : auth.forgot.title,
  };

  const handleBack = () => {
    if (view === "register" || view === "forgot") {
      if (view === "forgot") setForgotSent(false);
      setView("login");
    }
  };

  const subtitle = view === "forgot"
    ? (forgotSent ? auth.forgot.sentSubtitle : auth.forgot.subtitle)
    : titles[view].subtitle;

  const progressMessage = kycportLoading
    ? (auth.kycportConnecting ?? "Menghubungkan ke KYC Port…")
    : (auth.signingIn as string);

  return (
    <>
    <AuthProgressOverlay
      active={authBusy}
      message={progressMessage}
      submessage={auth.authenticatingHint as string | undefined}
    />
    <AuthLayout
      title={titles[view].title}
      subtitle={subtitle}
      showBack={view !== "login"}
      onBack={handleBack}
      logoContext={view === "login" ? "login" : "auth"}
    >
      <div className="space-y-4">
          {referralActive && referralCode && referralInvite && (
            <ReferralInviteBanner
              code={referralCode}
              badge={referralInvite.badge}
              title={referralInvite.title}
              subtitle={referralInvite.subtitle}
              codeLabel={referralInvite.codeLabel}
            />
          )}
          {view === "login" && (
            <>
              <KycPortAwaitingBanner />
              <SocialLoginButtons
                labels={{ google: auth.socialGoogle, apple: auth.socialApple, wallet: auth.socialWallet }}
                disabled={authBusy}
                onGoogle={() => run(signInWithGoogle)}
                onApple={() => run(signInWithApple)}
                onWallet={() => setWalletLoginOpen(true)}
              />
              {kycPortOAuthReady && (
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => run(signInWithKycPort)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 text-sm font-semibold gp-text disabled:opacity-60"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  {auth.wallets?.[3]?.name ?? "Connect KYCPort"}
                </button>
              )}
              <AuthDivider label={auth.orEmail} />
              <LoginForm
                email={email}
                password={password}
                remember={remember}
                loading={authBusy}
                labels={{
                  email: auth.email,
                  password: auth.password,
                  forgotPassword: auth.forgotPassword,
                  rememberSession: auth.rememberSession,
                  signIn: auth.signIn,
                  signingIn: auth.signingIn,
                }}
                onEmailChange={setEmail}
                onPasswordChange={setPassword}
                onRememberChange={setRemember}
                onForgotPassword={() => { setForgotEmail(email); setForgotSent(false); setView("forgot"); }}
                onSubmit={handleLogin}
              />
              <button type="button" onClick={() => setView("register")} className="w-full text-center gp-muted text-sm pb-2">
                {auth.noAccount} <span className="gp-auth-accent-gold font-semibold">{auth.registerNow}</span>
              </button>
            </>
          )}

          {view === "forgot" && !forgotSent && (
            <>
              <GlassCard className="p-4 space-y-3">
                <div>
                  <label className="gp-auth-label mb-1.5 block">{auth.email}</label>
                  <input type="email" value={forgotEmail || email} onChange={(e) => setForgotEmail(e.target.value)} placeholder="ali@garudaprime.id" autoComplete="email"
                    className="w-full px-4 py-3 rounded-xl gp-input gp-auth-input border focus:outline-none text-sm" />
                </div>
              </GlassCard>
              <PrimaryAuthButton onClick={handleForgotPassword} disabled={authBusy}>
                {auth.forgot.sendLink}
              </PrimaryAuthButton>
            </>
          )}

          {view === "forgot" && forgotSent && (
            <>
              <GlassCard className="p-6 flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 rounded-2xl gp-auth-luxe-icon gp-auth-luxe-icon--emerald flex items-center justify-center">
                  <Mail className="w-7 h-7 text-emerald-400" />
                </div>
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <p className="gp-muted text-sm leading-relaxed">{auth.forgot.sentSubtitle}</p>
              </GlassCard>
              <PrimaryAuthButton onClick={() => { setForgotSent(false); setView("login"); }}>
                {auth.forgot.backToLogin}
              </PrimaryAuthButton>
            </>
          )}

          {view === "register" && (
            <>
              <GlassCard className="p-4 space-y-3">
                {(["fullName", "email", "phone", "password", ...(referralActive ? ["referral"] as const : [])] as const).map((key) => (
                  <div key={key}>
                    <label className="gp-auth-label mb-1.5 block">{auth.fields[key].label}</label>
                    <input type={key === "password" ? "password" : key === "email" ? "email" : key === "phone" ? "tel" : "text"}
                      value={registerForm[key]}
                      onChange={(e) => {
                        setRegisterForm((p) => ({ ...p, [key]: e.target.value }));
                        if (key !== "referral" && registerErrors[key as keyof RegisterFieldErrors]) {
                          setRegisterErrors((prev) => ({ ...prev, [key]: undefined }));
                        }
                      }}
                      placeholder={auth.fields[key].placeholder}
                      className={`w-full px-4 py-3 rounded-xl gp-input gp-auth-input border focus:outline-none text-sm ${key !== "referral" && registerErrors[key as keyof RegisterFieldErrors] ? "border-red-400/60" : ""}`} />
                    {key === "referral" && "hint" in auth.fields.referral && auth.fields.referral.hint && (
                      <p className="mt-1 text-[10px] gp-muted leading-relaxed">{auth.fields.referral.hint}</p>
                    )}
                    {key !== "referral" && registerErrors[key as keyof RegisterFieldErrors] && (
                      <p className="mt-1 text-[11px] text-red-400">{toast[registerErrors[key as keyof RegisterFieldErrors]!]}</p>
                    )}
                  </div>
                ))}
              </GlassCard>
              <label className="flex items-start gap-3 px-1 text-xs gp-muted">
                <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-1 gp-auth-checkbox w-4 h-4" />
                <span>
                  {auth.terms}{" "}
                  <a href={TERMS_OF_SERVICE_URL} target="_blank" rel="noopener noreferrer" className="gp-auth-accent-gold underline underline-offset-2">{auth.termsLink}</a>
                  {" & "}
                  <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" className="gp-auth-accent-gold underline underline-offset-2">{auth.privacyLink}</a>.
                  {" "}{auth.termsEnd}
                </span>
              </label>
              <PrimaryAuthButton onClick={handleRegister} disabled={authBusy}>
                {auth.createAccount}
              </PrimaryAuthButton>
              <button type="button" onClick={() => setView("login")} className="w-full text-center gp-muted text-sm">
                {auth.hasAccount} <span className="gp-auth-accent-gold font-semibold">{auth.signIn}</span>
              </button>
            </>
          )}
      </div>
    </AuthLayout>
    <LoginWalletModal open={walletLoginOpen} onClose={() => setWalletLoginOpen(false)} />
    </>
  );
};
