import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";

type Props = {
  active: boolean;
  message: string;
  submessage?: string;
};

export function GarudaProcessOverlay({ active, message, submessage }: Props) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {active && (
        <motion.div
          role="status"
          aria-live="polite"
          aria-busy="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="gp-auth-overlay-backdrop fixed inset-0 z-[280] flex items-center justify-center px-6"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.22 }}
            className="w-full max-w-[18rem] rounded-2xl gp-auth-luxe-panel border border-emerald-500/25 px-5 py-5 text-center shadow-[0_12px_40px_rgba(0,0,0,0.42)]"
          >
            <div className="gp-process-dual-ring mx-auto mb-4" aria-hidden="true">
              <span className="gp-process-dual-ring-core" />
            </div>
            <p className="gp-text text-sm font-semibold leading-snug">{message}</p>
            {submessage && (
              <p className="gp-muted text-[11px] mt-1.5 leading-relaxed px-1">{submessage}</p>
            )}
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-emerald-500/10">
              <div className="gp-auth-overlay-progress h-full rounded-full" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
