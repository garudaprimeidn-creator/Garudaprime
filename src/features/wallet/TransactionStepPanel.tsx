import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, Loader2, Zap } from "lucide-react";

export type TxFlowStep = {
  id: string;
  label: string;
  hint?: string;
};

type Accent = "emerald" | "amber" | "indigo";

type Props = {
  title: string;
  subtitle?: string;
  steps: TxFlowStep[];
  currentStepId: string;
  phase: "running" | "success";
  accent?: Accent;
  successTitle?: string;
  successHint?: string;
  onSuccessDone?: () => void;
  successDelayMs?: number;
  portaled?: boolean;
};

const ACCENT: Record<Accent, { grad: string; bar: string; text: string }> = {
  emerald: {
    grad: "from-emerald-500 to-teal-400",
    bar: "from-emerald-400 to-teal-300",
    text: "text-emerald-400",
  },
  amber: {
    grad: "from-amber-500 to-orange-500",
    bar: "from-amber-400 to-orange-300",
    text: "text-amber-400",
  },
  indigo: {
    grad: "from-indigo-500 to-violet-500",
    bar: "from-indigo-400 to-violet-300",
    text: "text-indigo-400",
  },
};

function TxFlowBottomSheet({
  title,
  subtitle,
  steps,
  currentStepId,
  phase,
  accent = "emerald",
  successTitle,
  successHint,
  onSuccessDone,
  successDelayMs = 1400,
}: Props) {
  const cfg = ACCENT[accent];
  const currentIndex = Math.max(0, steps.findIndex((s) => s.id === currentStepId));
  const activeStep = steps[currentIndex] ?? steps[0];

  const headline = phase === "success"
    ? (successTitle ?? "Berhasil")
    : (activeStep?.label ?? "Memproses");

  const statusLine = useMemo(() => {
    if (phase === "success") return successHint ?? subtitle ?? "";
    return activeStep?.hint ?? subtitle ?? "Tunggu sebentar…";
  }, [phase, successHint, subtitle, activeStep]);

  useEffect(() => {
    if (phase !== "success" || !onSuccessDone) return;
    const timer = window.setTimeout(onSuccessDone, successDelayMs);
    return () => window.clearTimeout(timer);
  }, [phase, onSuccessDone, successDelayMs]);

  return (
    <div
      className="gp-tx-bottom-sheet"
      role="status"
      aria-live="polite"
      aria-busy={phase === "running"}
    >
      <div className="gp-modal-handle w-10 h-1 rounded-full mx-auto mt-2.5 mb-3 shrink-0" />

      <div className="flex items-center gap-3 px-5 pb-2">
        <div className={`gp-tx-bottom-sheet__icon bg-gradient-to-br ${cfg.grad}`}>
          {phase === "success" ? (
            <CheckCircle2 className="w-6 h-6 text-white" strokeWidth={2.4} />
          ) : (
            <Loader2 className="w-6 h-6 text-white animate-spin" strokeWidth={2.5} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-semibold uppercase tracking-widest ${cfg.text} flex items-center gap-1`}>
            <Zap className="w-3 h-3 shrink-0" />
            Garuda Prime · {title}
          </p>
          <p className="gp-text font-bold text-base leading-tight mt-0.5 truncate">{headline}</p>
          {statusLine ? (
            <p className="gp-muted text-xs mt-0.5 leading-snug">{statusLine}</p>
          ) : null}
        </div>
      </div>

      {steps.length > 1 ? (
        <div className="px-5 pb-3 flex gap-1.5">
          {steps.map((step, index) => {
            const done = phase === "success" || index < currentIndex;
            const active = phase === "running" && index === currentIndex;
            return (
              <div
                key={step.id}
                className={`gp-tx-bottom-sheet__pill${done ? " gp-tx-bottom-sheet__pill--done" : ""}${active ? " gp-tx-bottom-sheet__pill--active" : ""}`}
                title={step.label}
              />
            );
          })}
        </div>
      ) : null}

      <div className="mx-5 mb-[max(1rem,env(safe-area-inset-bottom))] h-1 rounded-full gp-toast-track overflow-hidden">
        {phase === "running" ? (
          <div className={`gp-tx-flow__bar-indeterminate h-full rounded-full bg-gradient-to-r ${cfg.bar}`} />
        ) : (
          <motion.div
            className={`h-full rounded-full bg-gradient-to-r ${cfg.bar}`}
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 0.4 }}
          />
        )}
      </div>
    </div>
  );
}

export function TransactionStepPanel(props: Props) {
  const { portaled = true, phase } = props;

  if (!portaled || typeof document === "undefined") {
    return phase ? <TxFlowBottomSheet {...props} /> : null;
  }

  return createPortal(
    <AnimatePresence>
      {phase && (
        <motion.div
          key="gp-tx-bottom-portal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="gp-tx-bottom-portal fixed inset-x-0 bottom-0 z-[235] mx-auto max-w-lg pointer-events-none"
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 340 }}
            className="pointer-events-auto"
          >
            <TxFlowBottomSheet {...props} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
