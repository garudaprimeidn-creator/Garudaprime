import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Wallet, TrendingUp, UsersRound, Brain, ArrowRight, CheckCircle } from "lucide-react";
import { GP_SEP_INLINE } from "../../app/garudaUi";
import { useLanguage } from "../../app/LanguageContext";
import { PremiumAuthBackground } from "./SplashScreen";
import { AuthLogoHeader } from "./AuthLogoHeader";
import { LanguageToggle } from "../../app/LanguageToggle";

const SLIDES = [
  { icon: Brain, tone: "gold" as const },
  { icon: Wallet, tone: "emerald" as const },
  { icon: TrendingUp, tone: "gold" as const },
  { icon: UsersRound, tone: "emerald" as const },
];

export const OnboardingScreen = ({ onDone }: { onDone: () => void }) => {
  const { t } = useLanguage();
  const [slide, setSlide] = useState(0);
  const current = SLIDES[slide];
  const slideText = t.onboarding[slide];
  const isLast = slide === SLIDES.length - 1;
  const Icon = current.icon;

  const next = () => {
    if (isLast) onDone();
    else setSlide((s) => s + 1);
  };

  return (
    <div className="gp-onboarding-screen relative flex flex-1 flex-col min-h-0 overflow-hidden gp-auth-scene gp-auth-luxe">
      <PremiumAuthBackground />

      <header className="gp-onboarding-screen__header relative z-10 shrink-0 px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-1">
        <div className="flex min-h-10 items-center justify-between gap-3">
          <LanguageToggle variant="auth" className="shrink-0" />
          {!isLast ? (
            <button
              type="button"
              onClick={onDone}
              className="gp-auth-skip gp-auth-skip--luxe shrink-0 text-sm px-3.5 py-1.5 rounded-full"
            >
              {t.skip}
            </button>
          ) : (
            <span className="w-10 shrink-0" aria-hidden />
          )}
        </div>
        <AuthLogoHeader size={44} animated context="onboarding" />
      </header>

      <div className="gp-onboarding-screen__body relative z-10 flex-1 min-h-0 px-6 pt-1 pb-2 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide}
            initial={{ opacity: 0, y: 16, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.99 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="h-full min-h-0 flex flex-col"
          >
            <div className="gp-auth-luxe-card gp-onboarding-screen__card relative flex-1 min-h-0 rounded-3xl overflow-hidden">
              <div className="gp-auth-luxe-card__glow absolute inset-0 pointer-events-none" aria-hidden />
              <div className="gp-auth-luxe-card__border absolute inset-0 pointer-events-none rounded-3xl" aria-hidden />
              <div className="relative h-full min-h-0 flex flex-col items-center justify-center px-6 py-6 sm:px-8 sm:py-10 text-center overflow-y-auto overscroll-contain">
                <motion.div
                  className={`gp-auth-luxe-icon gp-auth-luxe-icon--${current.tone} mb-5 sm:mb-7 shrink-0`}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.08 }}
                >
                  <Icon className="w-9 h-9" strokeWidth={1.65} />
                </motion.div>

                <span className="gp-auth-badge gp-auth-badge--luxe inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold mb-3 sm:mb-4 shrink-0">
                  <CheckCircle className="w-3 h-3" /> {t.syariah}
                </span>

                <p className="gp-auth-luxe-kicker text-[11px] font-semibold tracking-[0.2em] uppercase mb-2 shrink-0">
                  {slideText.subtitle}
                </p>
                <h2 className="gp-auth-luxe-title mb-2 sm:mb-3 shrink-0">{slideText.title}</h2>
                <p className="gp-auth-luxe-desc text-sm leading-relaxed max-w-[290px]">{slideText.description}</p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="gp-onboarding-screen__footer relative z-10 shrink-0 px-6 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4">
        <div className="flex items-center justify-center gap-2.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              aria-label={`Slide ${i + 1}`}
              aria-current={i === slide ? "step" : undefined}
              className={`gp-auth-luxe-dot transition-all duration-400 ${
                i === slide
                  ? "gp-auth-luxe-dot--active scale-110 opacity-100"
                  : "opacity-35 hover:opacity-60"
              }`}
            >
              <span className="gp-auth-luxe-dot__mark" aria-hidden />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={next}
          className="gp-auth-btn gp-auth-btn--luxe w-full py-3.5 sm:py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
        >
          {isLast ? t.start : t.next} <ArrowRight className="w-4 h-4" />
        </button>

        {!isLast && (
          <p className="text-center gp-auth-luxe-step text-[11px] tracking-[0.22em] uppercase pb-0.5">
            {slide + 1}{GP_SEP_INLINE}{SLIDES.length}
          </p>
        )}
      </footer>
    </div>
  );
};
