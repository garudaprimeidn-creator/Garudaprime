import React from "react";
import { GarudaLogo } from "../../../app/GarudaLogo";

type Props = {
  code: string;
  title: string;
  subtitle: string;
  badge: string;
  codeLabel: string;
};

export const ReferralInviteBanner = ({ code, title, subtitle, badge, codeLabel }: Props) => (
  <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-4 space-y-3">
    <div className="flex items-start gap-3">
      <div className="w-[72px] shrink-0 flex items-center justify-center">
        <GarudaLogo variant="brand" size={72} bare className="gp-referral-invite-logo" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/90">{badge}</p>
        <p className="gp-text text-sm font-semibold mt-0.5">{title}</p>
        <p className="gp-muted text-xs leading-relaxed mt-1">{subtitle}</p>
      </div>
    </div>
    <div className="rounded-xl border border-emerald-500/20 bg-black/10 px-3 py-2.5 text-center">
      <p className="gp-muted text-[10px] uppercase tracking-wider">{codeLabel}</p>
      <p className="gp-num gp-text text-sm font-bold tracking-wide mt-0.5">{code}</p>
    </div>
  </div>
);
