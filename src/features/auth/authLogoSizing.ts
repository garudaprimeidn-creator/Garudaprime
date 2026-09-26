import type { LogoVariant } from "../../app/GarudaLogo";

export const isMobileAuthViewport = () =>
  typeof window !== "undefined"
  && (window.matchMedia("(max-width: 768px)").matches
    || window.matchMedia("(pointer: coarse)").matches);

export type AuthLogoLayout = {
  variant: LogoVariant;
  size: number;
};

/** Auth header / login / register, premium emblem lockup */
export const resolveAuthHeaderLogo = (
  baseSize: number,
  _isDark: boolean,
  context: "auth" | "login" = "auth",
): AuthLogoLayout => {
  const mobile = isMobileAuthViewport();
  const isLogin = context === "login";

  if (mobile) {
    return { variant: "full", size: isLogin ? 96 : 112 };
  }

  const scale = isLogin ? 2.6 : 2.9;
  const cap = isLogin ? 168 : 184;

  return {
    variant: "full",
    size: Math.min(Math.round(Math.max(baseSize, 52) * scale), cap),
  };
};

/** Onboarding header, compact on mobile so CTA stays visible */
export const resolveOnboardingLogo = (): AuthLogoLayout => {
  if (isMobileAuthViewport()) {
    return { variant: "full", size: 80 };
  }
  return { variant: "full", size: 120 };
};

/** Splash, centered hero emblem */
export const resolveSplashLogo = (_isDark: boolean): AuthLogoLayout => {
  if (isMobileAuthViewport()) {
    return { variant: "full", size: 132 };
  }
  return { variant: "full", size: 200 };
};
