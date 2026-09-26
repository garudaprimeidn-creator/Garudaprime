import React from "react";
import { motion } from "motion/react";
import { ChevronLeft } from "lucide-react";
import { AnimatedBackground } from "./AnimatedBackground";
import { AuthLogoHeader } from "../AuthLogoHeader";
import { LanguageToggle } from "../../../app/LanguageToggle";

type Props = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  recaptchaId?: string;
  logoSize?: number;
  logoContext?: "auth" | "login";
};

export const AuthLayout = ({
  title, subtitle, showBack, onBack, children, footer, recaptchaId, logoSize = 52, logoContext = "auth",
}: Props) => (
  <div className="relative flex flex-1 flex-col min-h-0 overflow-hidden gp-auth-scene gp-auth-luxe">
    <AnimatedBackground />
    {recaptchaId && <div id={recaptchaId} className="sr-only" aria-hidden />}

    <div className="relative shrink-0 px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-1 overflow-visible">
      <div className="relative z-10 flex min-h-10 items-center justify-between gap-3">
        {showBack && onBack ? (
          <motion.button
            type="button"
            onClick={onBack}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-10 h-10 flex shrink-0 items-center justify-center rounded-full gp-auth-skip gp-auth-skip--luxe"
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.button>
        ) : (
          <span className="w-10 shrink-0" aria-hidden />
        )}
        <LanguageToggle variant="auth" className="shrink-0" />
      </div>
      <AuthLogoHeader size={logoSize} context={logoContext} />
    </div>

    <div
      className="relative flex-1 min-h-0 overflow-y-auto overscroll-y-contain gp-auth-scroll px-6 pb-[max(2rem,env(safe-area-inset-bottom))]"
      style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
    >
      <div className="space-y-4 pt-1 pb-4">
        <div className="gp-auth-luxe-heading text-center">
          <h2 className="gp-auth-luxe-title gp-auth-luxe-title--page">{title}</h2>
          {subtitle && (
            <p className="gp-auth-luxe-desc gp-auth-luxe-desc--page mt-2">{subtitle}</p>
          )}
        </div>
        {children}
      </div>
    </div>

    {footer}
  </div>
);

export const GlassCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <motion.div
    className={`gp-auth-luxe-panel rounded-2xl ${className}`}
    whileHover={{ boxShadow: "0 0 24px rgba(13, 202, 130, 0.08)" }}
    transition={{ duration: 0.25 }}
  >
    {children}
  </motion.div>
);

export const AuthDivider = ({ label }: { label: string }) => (
  <div className="gp-auth-divider gp-auth-divider--luxe flex items-center gap-3">
    <div className="flex-1 gp-auth-divider__line" />
    <span className="gp-auth-divider__label text-xs uppercase tracking-wider">{label}</span>
    <div className="flex-1 gp-auth-divider__line" />
  </div>
);

export const PrimaryAuthButton = ({
  children, onClick, disabled, loading, loadingLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: React.ReactNode;
}) => (
  <motion.button
    type="button"
    onClick={onClick}
    disabled={disabled || loading}
    whileHover={{ scale: disabled ? 1 : 1.01 }}
    whileTap={{ scale: disabled ? 1 : 0.98 }}
    className="relative overflow-hidden gp-auth-btn gp-auth-btn--luxe w-full py-4 rounded-2xl font-bold text-sm disabled:opacity-60"
  >
    {loading ? loadingLabel : children}
    {loading && (
      <motion.span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-300/80"
        initial={{ scaleX: 0, originX: 0 }}
        animate={{ scaleX: [0, 1, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      />
    )}
  </motion.button>
);
