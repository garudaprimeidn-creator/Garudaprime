import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../app/LanguageContext";
import { readAccountPreview } from "../../lib/auth/accountSetup";
import { validateSession } from "../../lib/security/sessionManager";

type StuckKind = "app-shell" | "register-orphan" | "loading";

export const BootRecovery = () => {
  const { phase, user, sessionRestoring, loading, signOut } = useAuth();
  const { lang } = useLanguage();
  const [stuck, setStuck] = useState<StuckKind | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setStuck(null);
    if (phase === "splash" || phase === "onboarding" || phase === "auth") return;

    let kind: StuckKind | null = null;
    let delay = 2_000;

    if (phase === "app" && !user?.uid && !sessionRestoring) {
      kind = "app-shell";
      delay = 900;
    } else if (phase === "register" && !user?.uid && !readAccountPreview() && !sessionRestoring) {
      kind = "register-orphan";
      delay = 4_000;
    } else if (loading && (phase === "register" || phase === "verify")) {
      kind = "loading";
      delay = 18_000;
    }

    if (!kind) return;
    const timer = window.setTimeout(() => setStuck(kind), delay);
    return () => window.clearTimeout(timer);
  }, [phase, user?.uid, sessionRestoring, loading]);

  useEffect(() => {
    if (stuck !== "register-orphan") return;
    const check = validateSession();
    if (check.valid) return;
    void signOut();
  }, [stuck, signOut]);

  if (!stuck) return null;

  const copy = lang === "id"
    ? {
        title: "Aplikasi tidak merespons",
        body: stuck === "app-shell"
          ? "Sesi login tidak lengkap. Reset untuk kembali ke halaman masuk."
          : stuck === "register-orphan"
            ? "Pendaftaran terputus. Reset untuk memulai lagi."
            : "Proses login terlalu lama. Reset dan coba lagi.",
        action: resetting ? "Memuat ulang…" : "Reset & masuk",
      }
    : {
        title: "App not responding",
        body: stuck === "app-shell"
          ? "Your login session is incomplete. Reset to return to sign-in."
          : stuck === "register-orphan"
            ? "Registration was interrupted. Reset to start over."
            : "Sign-in is taking too long. Reset and try again.",
        action: resetting ? "Reloading…" : "Reset & sign in",
      };

  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      await signOut();
    } catch {
      /* still reload */
    }
    window.location.replace("/?entry=auth");
  };

  return (
    <div
      className="fixed inset-0 z-[2147483640] flex items-end justify-center p-4 pointer-events-none"
      role="alertdialog"
      aria-labelledby="gp-boot-recovery-title"
    >
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-emerald-500/25 bg-white/95 dark:bg-zinc-900/95 shadow-xl px-4 py-4 text-center backdrop-blur-md">
        <p id="gp-boot-recovery-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {copy.title}
        </p>
        <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{copy.body}</p>
        <button
          type="button"
          disabled={resetting}
          onClick={() => void handleReset()}
          className="mt-3 inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4${resetting ? " animate-spin" : ""}`} />
          {copy.action}
        </button>
      </div>
    </div>
  );
};
