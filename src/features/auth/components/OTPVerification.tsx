import React, { useRef } from "react";
import { RefreshCw } from "lucide-react";
import { GlassCard, PrimaryAuthButton } from "./AuthLayout";

type Props = {
  otp: string[];
  loading?: boolean;
  resendSec: number;
  labels: {
    resendOtp: string;
    resendNow: string;
    verifyContinue: string;
  };
  onOtpChange: (index: number, value: string) => void;
  onResend: () => void;
  onVerify: () => void;
};

const formatResend = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const OTPVerification = ({
  otp, loading, resendSec, labels, onOtpChange, onResend, onVerify,
}: Props) => {
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (i: number, val: string) => {
    if (!/^[0-9]?$/.test(val)) return;
    onOtpChange(i, val);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };

  return (
    <>
      <GlassCard className="p-5">
        <div className="flex gap-2 justify-between">
          {otp.map((d, i) => (
            <input
              key={i}
              ref={(el) => { otpRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              className="gp-auth-otp w-full max-w-[48px] aspect-square text-center text-xl font-bold rounded-xl gp-input border gp-num focus:outline-none"
            />
          ))}
        </div>
      </GlassCard>
      <button
        type="button"
        onClick={onResend}
        disabled={resendSec > 0 || loading}
        className="w-full text-center text-xs gp-muted disabled:opacity-50"
      >
        {resendSec > 0
          ? labels.resendOtp.replace("0:58", formatResend(resendSec))
          : labels.resendNow}
      </button>
      <PrimaryAuthButton
        onClick={onVerify}
        disabled={loading}
        loading={loading}
        loadingLabel={<RefreshCw className="w-4 h-4 animate-spin mx-auto" />}
      >
        {labels.verifyContinue}
      </PrimaryAuthButton>
    </>
  );
};
