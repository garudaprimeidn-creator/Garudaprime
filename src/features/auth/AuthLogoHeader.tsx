import { CheckCircle } from "lucide-react";
import { useLanguage } from "../../app/LanguageContext";
import { AnimatedLaunchBrandLogo, LaunchBrandLogo } from "./LaunchBrandLogo";
import { resolveAuthHeaderLogo, resolveOnboardingLogo } from "./authLogoSizing";

export const AuthLogoHeader = ({
  size = 52,
  animated = false,
  context = "auth",
}: {
  size?: number;
  animated?: boolean;
  context?: "auth" | "onboarding" | "login";
}) => {
  const { t } = useLanguage();
  const layout =
    context === "onboarding"
      ? resolveOnboardingLogo()
      : resolveAuthHeaderLogo(size, true, context === "login" ? "login" : "auth");
  const displaySize = layout.size;
  const showBadge = context !== "onboarding";

  const brandClass = [
    "gp-auth-pro-brand gp-auth-pro-brand--compact flex flex-col items-center",
    context === "onboarding" ? "gp-auth-pro-brand--onboarding" : "",
    context === "login" ? "gp-auth-pro-brand--login" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={brandClass}>
      {animated ? (
        <AnimatedLaunchBrandLogo size={displaySize} linkToWeb={context !== "onboarding"} />
      ) : (
        <LaunchBrandLogo size={displaySize} linkToWeb={context !== "onboarding"} />
      )}
      {showBadge && (
        <span className="gp-auth-badge gp-auth-badge--pro inline-flex items-center gap-1.5 mt-2.5">
          <CheckCircle className="w-3 h-3 shrink-0" strokeWidth={2} />
          {t.syariah}
        </span>
      )}
    </div>
  );
};
