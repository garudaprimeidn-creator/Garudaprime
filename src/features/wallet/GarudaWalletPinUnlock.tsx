import React, { useState } from "react";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { hasAppPin, verifyAppPinAsync } from "../../lib/security/securityStore";
import { grantGarudaSignWindow } from "../../lib/web3/garudaWalletSignGate";
import { isAppLocked, unlockApp } from "../../lib/security/appLock";

type Props = {
  title: string;
  hint: string;
  pinLabel: string;
  pinPlaceholder: string;
  submitLabel: string;
  pinRequiredTitle: string;
  pinRequiredBody: string;
  invalidPin: string;
  onSuccess: () => void;
};

/** Verifikasi PIN aplikasi untuk membuka jendela tanda tangan dompet Garuda native (OTP/server). */
export function GarudaWalletPinUnlock({
  title,
  hint,
  pinLabel,
  pinPlaceholder,
  submitLabel,
  pinRequiredTitle,
  pinRequiredBody,
  invalidPin,
  onSuccess,
}: Props) {
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!hasAppPin()) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 space-y-1.5">
        <div className="flex gap-2.5">
          <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-300/95">{pinRequiredTitle}</p>
            <p className="text-[11px] gp-muted mt-0.5 leading-relaxed">{pinRequiredBody}</p>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) {
      setError(invalidPin);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const ok = await verifyAppPinAsync(pin);
      if (!ok) {
        setError(invalidPin);
        return;
      }
      if (isAppLocked()) unlockApp();
      grantGarudaSignWindow();
      setPin("");
      onSuccess();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="rounded-xl border gp-divider bg-black/10 p-3 space-y-2.5">
      <div>
        <p className="gp-text text-xs font-semibold">{title}</p>
        <p className="gp-muted text-[10px] leading-relaxed mt-0.5">{hint}</p>
      </div>
      <div>
        <label className="gp-muted text-[9px] font-bold uppercase tracking-wider">{pinLabel}</label>
        <div className="relative mt-1">
          <input
            type={showPin ? "text" : "password"}
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setError("");
            }}
            placeholder={pinPlaceholder}
            className="gp-input w-full pr-10 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPin((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 gp-muted hover:gp-text p-1"
            aria-label={showPin ? "Hide PIN" : "Show PIN"}
          >
            {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
      </div>
      <button
        type="submit"
        disabled={busy || pin.length < 4}
        className="w-full py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/35 text-emerald-400 font-semibold text-xs flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
        {submitLabel}
      </button>
    </form>
  );
}
