import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { useLanguage } from "../../app/LanguageContext";
import { isStandalonePwa, isMobileUserAgent } from "../../lib/auth/oauthEnvironment";
import { LaunchBrandLogo } from "./LaunchBrandLogo";
import { resolveSplashLogo } from "./authLogoSizing";

/** Charcoal launch canvas, matches premium Garuda Prime emblem artwork */
export const PremiumAuthBackground = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden">
    <div className="absolute inset-0 gp-auth-launch-bg" />
    <div className="gp-auth-launch-grain absolute inset-0" aria-hidden />
  </div>
);

export const ClassicAuthBackground = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden">
    <div className="gp-auth-classic-bg absolute inset-0" />
    <div className="gp-auth-classic-border gp-auth-classic-border--top" aria-hidden />
    <div className="gp-auth-classic-border gp-auth-classic-border--bottom" aria-hidden />
  </div>
);

export const AuthBackground = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden">
    <div className="gp-auth-exec-bg-dark absolute inset-0" />
  </div>
);

export const ParticleBackground = () => null;

const SplashBrandLogo = ({ compact }: { compact?: boolean }) => {
  const reduceMotion = useReducedMotion();
  const layout = resolveSplashLogo(true);
  const displaySize = layout.size;

  const logo = (
    <div className="gp-splash-logo__mark">
      <LaunchBrandLogo size={displaySize} />
    </div>
  );

  if (reduceMotion) {
    return (
      <div className="gp-splash-logo gp-splash-logo--static" aria-hidden>
        <div className="gp-splash-halo" aria-hidden />
        {logo}
      </div>
    );
  }

  return (
    <div className="gp-splash-logo" aria-hidden>
      <motion.div
        className="gp-splash-halo"
        aria-hidden
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: [0.5, 0.75, 0.5], scale: [0.96, 1.02, 0.96] }}
        transition={{
          opacity: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
          scale: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
        }}
      />
      <motion.div
        className="gp-splash-logo__float"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1, y: [0, -2, 0] }}
        transition={{
          opacity: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
          scale: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
          y: { duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.35 },
        }}
      >
        {logo}
      </motion.div>
    </div>
  );
};

export const SplashScreen = ({ onDone }: { onDone: () => void }) => {
  const { t } = useLanguage();
  const splash = t.splash as Record<string, string>;
  const isMobile = typeof window !== "undefined" && (isStandalonePwa() || isMobileUserAgent());
  const reduceMotion = useReducedMotion();
  const doneRef = React.useRef(false);
  const minElapsedRef = React.useRef(false);

  const fireDone = React.useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  const tryAdvance = React.useCallback(() => {
    if (!minElapsedRef.current) return;
    fireDone();
  }, [fireDone]);

  const minMs = reduceMotion ? 280 : isMobile ? 400 : 450;
  const maxMs = reduceMotion ? 480 : isMobile ? 850 : 950;
  const progressSec = minMs / 1000;

  React.useEffect(() => {
    const minTimer = window.setTimeout(() => {
      minElapsedRef.current = true;
      tryAdvance();
    }, minMs);
    const maxTimer = window.setTimeout(fireDone, maxMs);
    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
    };
  }, [fireDone, minMs, maxMs, tryAdvance]);

  const contentVariants = reduceMotion
    ? undefined
    : {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.07, delayChildren: 0.05 },
        },
      };

  const itemVariants = reduceMotion
    ? undefined
    : {
        hidden: { opacity: 0, y: 10 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
        },
      };

  return (
    <div
      className="gp-splash-screen relative flex flex-1 flex-col items-center justify-center overflow-hidden"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={splash.brand ?? "Garuda Prime"}
    >
      <div className="gp-splash-screen__bg gp-splash-screen__bg--animated" aria-hidden />
      <div className="gp-splash-screen__grain" aria-hidden />

      <motion.div
        className="gp-splash-screen__content relative flex flex-col items-center gap-3.5 px-8 text-center z-[1]"
        initial={reduceMotion ? false : "hidden"}
        animate={reduceMotion ? undefined : "visible"}
        variants={contentVariants}
      >
        <motion.div variants={itemVariants}>
          <SplashBrandLogo compact={isMobile} />
        </motion.div>
        <motion.p className="gp-splash-brand" variants={itemVariants}>
          {splash.brand ?? "Garuda Prime"}
        </motion.p>
        <motion.p className="gp-splash-tagline" variants={itemVariants}>
          {splash.tagline}
        </motion.p>
        <motion.div
          className="flex items-center gap-2.5 gp-splash-meta"
          variants={itemVariants}
        >
          <motion.span
            className="gp-splash-meta__dot"
            aria-hidden
            animate={reduceMotion ? undefined : { opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="gp-splash-meta__text gp-num">{splash.network}</span>
          <motion.span
            className="gp-splash-meta__dot"
            aria-hidden
            animate={reduceMotion ? undefined : { opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
          />
        </motion.div>
      </motion.div>

      <motion.div
        className="gp-splash-screen__footer absolute z-[1] flex flex-col items-center gap-3 w-[min(72vw,12rem)]"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 0.18, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="gp-splash-progress-track w-full overflow-hidden rounded-full">
          <motion.div
            className="gp-splash-progress-bar gp-splash-progress-bar--animated h-full rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: progressSec, ease: [0.35, 0, 0.15, 1] }}
          />
        </div>
        <p className="gp-splash-version gp-num">{splash.version}</p>
      </motion.div>
    </div>
  );
};
