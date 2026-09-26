import React from "react";
import {
  AlertCircle, CheckCircle2, ChevronRight, Crown, FileText, MapPin, Shield, Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type StepState = "done" | "current" | "pending";

type KycStep = {
  icon: LucideIcon;
  title: string;
  desc: string;
  state: StepState;
  action?: boolean;
};

type Props = {
  statusLabel: string;
  statusTone: "verified" | "pending" | "rejected" | "limited";
  progressCount: number;
  totalSteps: number;
  steps: KycStep[];
  banner?: string;
  tierLabel: string;
  progressLabel: string;
  stepDone: string;
  stepCurrent: string;
  stepPending: string;
  upgrading?: boolean;
  upgradeLabel: string;
  processingLabel: string;
  onUpgrade?: () => void;
  verified?: boolean;
};

export const KycStatusCard = ({
  statusLabel,
  statusTone,
  progressCount,
  totalSteps,
  steps,
  banner,
  tierLabel,
  progressLabel,
  stepDone,
  stepCurrent,
  stepPending,
  upgrading,
  upgradeLabel,
  processingLabel,
  onUpgrade,
  verified,
}: Props) => {
  const pct = Math.round((progressCount / totalSteps) * 100);

  return (
    <div className={`gp-kyc-card gp-kyc-card--${statusTone}`}>
      <div className="gp-kyc-card__header">
        <div className="gp-kyc-card__tier">
          <Shield className="w-4 h-4" strokeWidth={2} />
          <span>{tierLabel}</span>
        </div>
        <span className={`gp-kyc-card__status gp-kyc-card__status--${statusTone}`}>
          {statusLabel}
        </span>
      </div>

      <div className="gp-kyc-card__progress-row">
        <div className="gp-kyc-card__ring" style={{ "--gp-kyc-pct": `${pct}%` } as React.CSSProperties}>
          <span className="gp-kyc-card__ring-inner">
            <strong>{progressCount}</strong>
            <small>/{totalSteps}</small>
          </span>
        </div>
        <div className="gp-kyc-card__progress-copy">
          <p className="gp-kyc-card__progress-title">{progressLabel}</p>
          <div className="gp-kyc-card__bar" aria-hidden>
            <div className="gp-kyc-card__bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="gp-kyc-card__progress-pct">{pct}%</p>
        </div>
      </div>

      {!verified && banner && (
        <div className="gp-kyc-card__alert">
          <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={2} />
          <p>{banner}</p>
        </div>
      )}

      {!verified && onUpgrade && (
        <button
          type="button"
          onClick={onUpgrade}
          disabled={upgrading}
          className="gp-kyc-card__cta"
        >
          <Sparkles className="w-4 h-4" />
          {upgrading ? processingLabel : upgradeLabel}
          <ChevronRight className="w-4 h-4 ml-auto" />
        </button>
      )}

      <ol className="gp-kyc-card__steps">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const statusText = step.state === "done" ? stepDone : step.state === "current" ? stepCurrent : stepPending;
          const isLast = idx === steps.length - 1;
          return (
            <li key={step.title} className={`gp-kyc-card__step gp-kyc-card__step--${step.state}`}>
              {!isLast && <span className="gp-kyc-card__step-line" aria-hidden />}
              <div className="gp-kyc-card__step-icon">
                {step.state === "done" ? (
                  <CheckCircle2 className="w-4 h-4" strokeWidth={2.2} />
                ) : (
                  <Icon className="w-4 h-4" strokeWidth={2} />
                )}
              </div>
              <div className="gp-kyc-card__step-body">
                <p className="gp-kyc-card__step-title">{step.title}</p>
                <p className="gp-kyc-card__step-desc">{step.desc}</p>
              </div>
              <span className={`gp-kyc-card__step-badge gp-kyc-card__step-badge--${step.state}`}>
                {statusText}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export const KYC_STEP_ICONS = [Shield, FileText, MapPin, Crown] as const;
