import React, { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../app/LanguageContext";
import { SplashScreen } from "../auth/SplashScreen";
import { OnboardingScreen } from "../auth/OnboardingScreen";
import { AuthPage } from "../auth/AuthPage";
import { RegistrationFlow } from "../auth/RegistrationFlow";
import { MfaLoginScreen } from "../security/SecuritySheets";
import { BootRecovery } from "./BootRecovery";

const FLOW_ENTER = { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const };
const FLOW_EXIT = { duration: 0.38, ease: [0.4, 0, 0.2, 1] as const };

const FlowLayer = ({
  children,
  splash = false,
}: {
  children: React.ReactNode;
  splash?: boolean;
}) => (
  <motion.div
    className={`gp-flow-stage__layer${splash ? " gp-flow-stage__layer--splash" : ""}`}
    initial={{ opacity: 1 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={splash ? FLOW_EXIT : FLOW_ENTER}
  >
    {children}
  </motion.div>
);

export const AppFlow = ({ children }: { children: React.ReactNode }) => {
  const { phase, completeSplash, completeOnboarding, mfaUid, user, completeMfaLogin, sessionRestoring } = useAuth();
  const { t } = useLanguage();
  const sec = t.security as Record<string, string>;

  const splashChromeActive = phase === "splash";

  useEffect(() => {
    const root = document.documentElement;
    if (splashChromeActive) {
      root.classList.add("gp-splash-active");
    } else {
      root.classList.remove("gp-splash-active");
    }
    return () => root.classList.remove("gp-splash-active");
  }, [splashChromeActive]);

  const showAuthFallback =
    phase !== "onboarding"
    && phase !== "auth"
    && phase !== "register"
    && phase !== "splash"
    && !(phase === "mfa" && mfaUid);

  if (phase === "app") {
    if (!user?.uid && sessionRestoring) {
      return (
        <>
          <div className="gp-shell-outer flex items-center justify-center min-h-[100dvh]">
            <p className="gp-muted text-sm animate-pulse">Memuat akun…</p>
          </div>
          <BootRecovery />
        </>
      );
    }
    return (
      <>
        {children}
        <BootRecovery />
      </>
    );
  }

  return (
    <div
      className={`gp-shell-outer flex items-stretch sm:items-center justify-center sm:p-6${splashChromeActive ? " gp-flow-splash" : ""}`}
      style={{ fontFamily: "'Inter',sans-serif" }}
    >
      <div
        className={`gp-phone-frame gp-phone-frame--flow relative w-full h-[100dvh] max-h-[100dvh] sm:max-w-[430px] sm:h-[min(932px,100dvh)] sm:max-h-[min(932px,100dvh)] sm:rounded-[2rem] sm:border overflow-hidden flex flex-col${splashChromeActive ? " gp-phone-frame--splash" : ""}`}
      >
        <div className="gp-flow-stage flex flex-1 flex-col min-h-0">
          <AnimatePresence initial={false}>
            {phase === "onboarding" && (
              <FlowLayer key="onboarding">
                <OnboardingScreen onDone={completeOnboarding} />
              </FlowLayer>
            )}
            {phase === "auth" && (
              <FlowLayer key="auth">
                <AuthPage />
              </FlowLayer>
            )}
            {phase === "mfa" && mfaUid && (
              <FlowLayer key="mfa">
                <MfaLoginScreen
                  uid={mfaUid}
                  accountLabel={user?.email ?? user?.displayName ?? ""}
                  labels={sec}
                  onVerified={completeMfaLogin}
                />
              </FlowLayer>
            )}
            {phase === "register" && (
              <FlowLayer key="register">
                <RegistrationFlow />
              </FlowLayer>
            )}
            {phase === "splash" && (
              <FlowLayer key="splash" splash>
                <SplashScreen onDone={completeSplash} />
              </FlowLayer>
            )}
            {showAuthFallback && (
              <FlowLayer key="auth-fallback">
                <AuthPage />
              </FlowLayer>
            )}
          </AnimatePresence>
        </div>
      </div>
      <BootRecovery />
    </div>
  );
};
