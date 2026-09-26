import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Info, ChevronRight } from "lucide-react";
import { useLanguage } from "./LanguageContext";

type GuideContent = {
  info: string;
  features: readonly string[];
  action: string;
};

export type ToolInfoTone =
  | "emerald" | "cyan" | "violet" | "amber" | "orange"
  | "fuchsia" | "indigo" | "teal" | "sky" | "gold";

export const ToolFeaturesList = ({
  features,
  label,
}: {
  features: readonly string[];
  label?: string;
}) => {
  const { t } = useLanguage();
  if (features.length === 0) return null;

  const title = label ?? t.toolsPanel.featuresLabel;

  return (
    <div className="gp-tool-info-box__features">
      <div className="gp-tool-info-box__features-head">
        <p className="gp-tool-info-box__label">{title}</p>
        <span className="gp-tool-info-box__line" aria-hidden />
      </div>
      <ul className="gp-tool-info-box__grid grid grid-cols-2">
        {features.map((f) => (
          <li key={f} className="gp-tool-info-box__item">
            <span className="gp-tool-info-box__bullet" aria-hidden />
            <span className="gp-tool-info-box__text">{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const ToolInfoBox = ({
  info,
  features,
  compact = false,
  tone = "emerald",
}: {
  info: string;
  features: readonly string[];
  compact?: boolean;
  tone?: ToolInfoTone;
}) => {
  const showFeatures = !compact && features.length > 0;

  return (
    <div className={`gp-tool-info-box gp-tool-info-box--tone-${tone}${compact ? " gp-tool-info-box--compact" : ""}`}>
      <span className="gp-tool-info-box__accent" aria-hidden />
      <div className="gp-tool-info-box__inner">
        <div className="gp-tool-info-box__intro-row">
          <span className="gp-tool-info-box__icon-well">
            <Info className="gp-tool-info-box__icon" strokeWidth={2} aria-hidden />
          </span>
          <p className="gp-tool-info-box__intro">{info}</p>
        </div>
        {showFeatures && <ToolFeaturesList features={features} />}
      </div>
    </div>
  );
};

export const ToolGuideSheet = ({
  title, guide, open, onClose, onConfirm, tone = "emerald",
}: {
  title: string;
  guide: GuideContent | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  tone?: ToolInfoTone;
}) => {
  const { t } = useLanguage();
  if (!guide) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 gp-overlay-panel z-[60]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="fixed bottom-0 left-0 right-0 z-[60] gp-modal-sheet border-t rounded-t-3xl mx-auto max-w-lg max-h-[85vh] flex flex-col"
          >
            <div className="gp-modal-handle w-10 h-1 rounded-full mx-auto mt-3 mb-2 shrink-0" />
            <div className="gp-panel-header flex items-start justify-between gap-3 px-5 pb-0 shrink-0">
              <div>
                <p className="gp-muted text-[10px] uppercase tracking-widest">{t.tools}</p>
                <h3 className="gp-text font-bold text-base mt-0.5">{title}</h3>
              </div>
              <button type="button" onClick={onClose} className="gp-muted gp-icon-btn p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="gp-panel-body px-5 pb-4" style={{ scrollbarWidth: "none" }}>
              <ToolInfoBox info={guide.info} features={guide.features} tone={tone} />
            </div>
            <div className="px-5 py-4 border-t gp-divider shrink-0">
              <button
                type="button"
                onClick={() => { onConfirm(); onClose(); }}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm flex items-center justify-center gap-2"
              >
                {guide.action} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
