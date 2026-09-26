import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { LaunchBrandLogo } from "../LaunchBrandLogo";

type Props = {
  active: boolean;
  message: string;
  submessage?: string;
};

export const AuthProgressOverlay = ({ active, message, submessage }: Props) => (
  <AnimatePresence>
    {active && (
      <motion.div
        role="status"
        aria-live="polite"
        aria-busy="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="gp-auth-overlay-backdrop fixed inset-0 z-[120] flex items-center justify-center px-6"
      >
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.22 }}
          className="w-full max-w-[17rem] rounded-2xl gp-auth-luxe-panel border border-emerald-500/20 px-5 py-5 text-center shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
        >
          <div className="mx-auto mb-3.5 flex items-center justify-center">
            <LaunchBrandLogo size={72} className="drop-shadow-[0_4px_20px_rgba(5,150,105,0.25)]" />
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
  </AnimatePresence>
);
