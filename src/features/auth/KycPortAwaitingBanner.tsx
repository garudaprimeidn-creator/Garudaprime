import React from "react";
import { Shield, ArrowRight, Loader2 } from "lucide-react";
import { useLanguage } from "../../app/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";

export const KycPortAwaitingBanner = () => {
  const { t } = useLanguage();
  const auth = t.auth as Record<string, unknown>;
  const portal = auth.kycportPortal as Record<string, string> | undefined;
  const { kycportConnectionPending, resumeKycPortConnection, loading } = useAuth();
  const [busy, setBusy] = React.useState(false);

  if (!kycportConnectionPending) return null;

  const handleResume = async () => {
    setBusy(true);
    try {
      await resumeKycPortConnection();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
          <Shield className="w-5 h-5 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold gp-text">
            {portal?.resumeTitle ?? "Sudah login di KYCPORT?"}
          </p>
          <p className="text-xs gp-muted mt-1 leading-relaxed">
            {portal?.resumeHint
              ?? "Tap Lanjutkan. Jendela KYC Port akan terbuka, lalu otomatis kembali ke Garuda Prime setelah izin aplikasi."}
          </p>
          <p className="text-[10px] gp-muted mt-2 leading-relaxed">
            {portal?.resumeStuckHint
              ?? "Sudah Verified di kycport.com/status? Tetap tap Lanjutkan di sini agar akun tersinkron."}
          </p>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void handleResume()}
              disabled={busy || loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60"
            >
              {busy || loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5" />
              )}
              {portal?.resumeButton ?? "Lanjutkan ke Garuda Prime"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
