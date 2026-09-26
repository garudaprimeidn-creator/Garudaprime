import React from "react";
import { Lock } from "lucide-react";

type Props = {
  title: string;
  description?: string;
  compact?: boolean;
};

export const ReferralLockedNotice = ({ title, description, compact = false }: Props) => (
  <div className={`rounded-xl border border-amber-500/25 bg-amber-500/[0.06] ${compact ? "p-3" : "p-5"} text-center space-y-2`}>
    <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25">
      <Lock className="w-5 h-5 text-amber-400" />
    </div>
    <p className="gp-text text-sm font-semibold">{title}</p>
    {description ? (
      <p className="gp-muted text-xs leading-relaxed">{description}</p>
    ) : null}
  </div>
);
