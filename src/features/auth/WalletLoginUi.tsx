import React from "react";
import type { LucideIcon } from "lucide-react";
import { Wallet, X } from "lucide-react";

type SheetHeaderProps = {
  title: string;
  subtitle: string;
  onClose: () => void;
};

export function WalletLoginSheetHeader({ title, subtitle, onClose }: SheetHeaderProps) {
  return (
    <div className="gp-login-wallet-sheet__header">
      <div className="gp-login-wallet-sheet__header-main">
        <span className="gp-login-wallet-sheet__header-icon" aria-hidden>
          <Wallet className="w-5 h-5" strokeWidth={2} />
        </span>
        <div className="gp-login-wallet-sheet__header-text min-w-0">
          <h3 className="gp-login-wallet-sheet__title">{title}</h3>
          <p className="gp-login-wallet-sheet__subtitle">{subtitle}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="gp-login-wallet-sheet__close"
        aria-label="Close"
      >
        <X className="w-5 h-5" strokeWidth={2} />
      </button>
    </div>
  );
}

type StepRailProps = {
  steps: Array<{ id: string; label: string }>;
  activeIndex: number;
};

export function WalletLoginStepRail({ steps, activeIndex }: StepRailProps) {
  return (
    <ol className="gp-sec-sheet__rail gp-login-wallet-sheet__rail" style={{ "--gp-sec-steps": steps.length } as React.CSSProperties}>
      {steps.map((s, i) => (
        <li
          key={s.id}
          className={`gp-sec-sheet__rail-item${i < activeIndex ? " gp-sec-sheet__rail-item--done" : ""}${i === activeIndex ? " gp-sec-sheet__rail-item--active" : ""}${i > activeIndex ? " gp-sec-sheet__rail-item--pending" : ""}`}
        >
          <div className="gp-sec-sheet__rail-track">
            {i > 0 && (
              <span className={`gp-sec-sheet__rail-connector${i <= activeIndex ? " gp-sec-sheet__rail-connector--done" : ""}`} />
            )}
            <span className="gp-sec-sheet__rail-marker">
              {i < activeIndex ? "✓" : i === activeIndex ? <span className="gp-sec-sheet__rail-dot gp-sec-sheet__rail-dot--pulse" /> : i + 1}
            </span>
            {i < steps.length - 1 && (
              <span className={`gp-sec-sheet__rail-connector${i < activeIndex ? " gp-sec-sheet__rail-connector--done" : ""}`} />
            )}
          </div>
          <span className="gp-sec-sheet__rail-label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

type StepProgressProps = {
  current: number;
  total: number;
};

export function WalletLoginStepProgress({ current, total }: StepProgressProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="gp-login-wallet-sheet__progress">
      <div className="gp-login-wallet-sheet__progress-track" aria-hidden>
        <span className="gp-login-wallet-sheet__progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="gp-login-wallet-sheet__progress-count gp-num">{current}/{total}</span>
    </div>
  );
}

type SectionHeadProps = {
  icon: LucideIcon;
  title: string;
  hint: string;
  meta?: string;
  address?: string;
};

export function WalletLoginSectionHead({ icon: Icon, title, hint, meta, address }: SectionHeadProps) {
  return (
    <div className="gp-login-wallet-sheet__section">
      <div className="gp-login-wallet-sheet__section-head">
        <span className="gp-login-wallet-sheet__section-icon" aria-hidden>
          <Icon className="w-4 h-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="gp-login-wallet-sheet__section-title">{title}</p>
          <p className="gp-login-wallet-sheet__section-hint">{hint}</p>
          {address && <p className="gp-login-wallet-sheet__section-address gp-num">{address}</p>}
        </div>
      </div>
      {meta && <p className="gp-login-wallet-sheet__section-meta">{meta}</p>}
    </div>
  );
}
