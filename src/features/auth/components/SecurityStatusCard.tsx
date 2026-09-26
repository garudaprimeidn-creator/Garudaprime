import React from "react";
import { motion } from "motion/react";
import { Shield, Fingerprint, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { GlassCard } from "./AuthLayout";

export type SecurityItem = {
  id: string;
  label: string;
  description?: string;
  enabled: boolean;
  icon?: "shield" | "fingerprint" | "lock";
};

const ICONS = {
  shield: Shield,
  fingerprint: Fingerprint,
  lock: Lock,
};

type Props = {
  title?: string;
  items: SecurityItem[];
  className?: string;
  compact?: boolean;
};

export const SecurityStatusCard = ({ title, items, className = "", compact = false }: Props) => (
  <GlassCard className={`${compact ? "p-3 space-y-2" : "p-4 space-y-3"} ${className}`}>
    {title && (
      <p className={`gp-auth-label font-semibold ${compact ? "text-[11px] uppercase tracking-wide px-0.5" : "text-sm"}`}>
        {title}
      </p>
    )}
    {items.map((item, i) => {
      const Icon = ICONS[item.icon ?? "shield"];
      return (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06 }}
          className={`flex items-center gap-2.5 rounded-xl border border-white/5 ${
            compact ? "px-2.5 py-2" : "items-start gap-3 p-3"
          }`}
        >
          <div className={`rounded-lg ${compact ? "p-1.5" : "p-2"} ${item.enabled ? "bg-emerald-500/15" : "bg-white/5"}`}>
            <Icon className={`${compact ? "w-3.5 h-3.5" : "w-4 h-4"} ${item.enabled ? "text-emerald-400" : "gp-muted"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`gp-text font-medium ${compact ? "text-xs" : "text-sm"}`}>{item.label}</p>
            {item.description && !compact && (
              <p className="gp-muted text-[11px] mt-0.5 leading-relaxed truncate">{item.description}</p>
            )}
          </div>
          {item.enabled
            ? <CheckCircle2 className={`${compact ? "w-3.5 h-3.5" : "w-4 h-4"} text-emerald-400 shrink-0`} />
            : <AlertCircle className={`${compact ? "w-3.5 h-3.5" : "w-4 h-4"} text-amber-400/80 shrink-0`} />}
        </motion.div>
      );
    })}
  </GlassCard>
);
