import React, { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../app/LanguageContext";
import { hasKycPortOAuthCallbackParams } from "../../lib/kyc/kycportCallbackParams";

export const KycPortCallbackScreen = () => {
  const { lang } = useLanguage();
  const { processKycPortOAuthCallback } = useAuth();
  const [status, setStatus] = useState<"working" | "error">("working");
  const [message, setMessage] = useState(
    lang === "id" ? "Menghubungkan akun KYC Port…" : "Connecting KYC Port account…",
  );
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    document.documentElement.classList.remove("gp-oauth-pending");
    document.getElementById("gp-oauth-boot-overlay")?.setAttribute("hidden", "");

    if (!hasKycPortOAuthCallbackParams()) {
      setStatus("error");
      setMessage(
        lang === "id"
          ? "Tidak ada data login. Kembali ke halaman masuk…"
          : "No login data. Returning to sign-in…",
      );
      window.setTimeout(() => { window.location.replace("/?entry=auth"); }, 1500);
      return;
    }

    const hardStop = window.setTimeout(() => {
      setStatus("error");
      setMessage(
        lang === "id"
          ? "KYC Port tidak merespons. Kembali ke aplikasi…"
          : "KYC Port timed out. Returning to app…",
      );
      window.location.replace("/?entry=auth");
    }, 50_000);

    void processKycPortOAuthCallback()
      .then((next) => {
        window.clearTimeout(hardStop);
        window.location.replace(next === "auth" ? "/?entry=auth" : "/");
      })
      .catch(() => {
        window.clearTimeout(hardStop);
        setStatus("error");
        setMessage(
          lang === "id"
            ? "Sinkronisasi gagal. Kembali ke login, tap Lanjutkan untuk mencoba lagi."
            : "Sync failed. Return to login and tap Continue to retry.",
        );
        window.setTimeout(() => { window.location.replace("/?entry=auth"); }, 2400);
      });

    return () => window.clearTimeout(hardStop);
  }, [processKycPortOAuthCallback, lang]);

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 bg-[#f4f8f6] text-center">
      <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-4">
        {status === "working" ? (
          <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
        ) : (
          <AlertCircle className="w-7 h-7 text-amber-500" />
        )}
      </div>
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600" />
        <p className="text-sm font-semibold text-zinc-800">KYC Port × Garuda Prime</p>
      </div>
      <p className="text-sm text-zinc-600 max-w-xs leading-relaxed">{message}</p>
    </div>
  );
};
