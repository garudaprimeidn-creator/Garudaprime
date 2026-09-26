import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  BadgeCheck, ShieldAlert, Info, AlertTriangle, X,
  Check, Ban, BellRing, Shield,
} from "lucide-react";
import { useLanguage } from "./LanguageContext";

export type ToastType = "success" | "error" | "info" | "warning";

type ToastItem = { id: number; message: string; type: ToastType };

const CONFIG: Record<ToastType, {
  Icon: typeof BadgeCheck;
  HeaderIcon: typeof Check;
  accent: string;
  glow: string;
  bar: string;
}> = {
  success: {
    Icon: BadgeCheck,
    HeaderIcon: Check,
    accent: "from-emerald-500 to-teal-400",
    glow: "shadow-[0_0_40px_rgba(13,202,130,0.35)]",
    bar: "from-emerald-400 to-teal-300",
  },
  error: {
    Icon: Ban,
    HeaderIcon: ShieldAlert,
    accent: "from-rose-500 to-red-500",
    glow: "shadow-[0_0_40px_rgba(244,63,94,0.3)]",
    bar: "from-rose-400 to-red-300",
  },
  info: {
    Icon: BellRing,
    HeaderIcon: Info,
    accent: "from-cyan-500 to-blue-500",
    glow: "shadow-[0_0_40px_rgba(34,211,238,0.28)]",
    bar: "from-cyan-400 to-blue-300",
  },
  warning: {
    Icon: AlertTriangle,
    HeaderIcon: Shield,
    accent: "from-amber-500 to-orange-500",
    glow: "shadow-[0_0_40px_rgba(251,191,36,0.28)]",
    bar: "from-amber-400 to-orange-300",
  },
};

const DURATION_MS = 3600;

let pushToast: ((message: string, type: ToastType) => void) | null = null;

export function showAppToast(message: string, type: ToastType = "success") {
  pushToast?.(message, type);
}

const ToastIconBadge = ({
  type,
}: { type: ToastType }) => {
  const cfg = CONFIG[type];
  const { Icon } = cfg;
  return (
    <div className="relative shrink-0">
      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${cfg.accent} opacity-30 blur-md scale-110`} />
      <div className={`relative w-11 h-11 rounded-2xl bg-gradient-to-br ${cfg.accent} flex items-center justify-center shadow-lg ring-1 ring-white/20`}>
        <Icon className="w-5 h-5 text-white drop-shadow-sm" strokeWidth={2.4} />
      </div>
    </div>
  );
};

export function AppToaster() {
  const { t } = useLanguage();
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [progress, setProgress] = useState(100);

  const labels: Record<ToastType, string> = {
    success: t.toast.toastSuccess,
    error: t.toast.toastError,
    info: t.toast.toastInfo,
    warning: t.toast.toastWarning,
  };

  const show = useCallback((message: string, type: ToastType) => {
    setProgress(100);
    setToast({ id: Date.now(), message, type });
  }, []);

  useEffect(() => {
    pushToast = show;
    return () => { pushToast = null; };
  }, [show]);

  useEffect(() => {
    if (!toast) return;
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.max(0, 100 - (elapsed / DURATION_MS) * 100));
    }, 40);
    const timer = setTimeout(() => setToast(null), DURATION_MS);
    return () => { clearTimeout(timer); clearInterval(tick); };
  }, [toast]);

  if (typeof document === "undefined") return null;

  const cfg = toast ? CONFIG[toast.type] : CONFIG.success;
  const HeaderIcon = cfg.HeaderIcon;

  return createPortal(
    <AnimatePresence>
      {toast && (
        <div
          className="fixed inset-x-0 top-0 z-[99999] flex justify-center pointer-events-none px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
          aria-live="polite"
        >
          <motion.div
            key={toast.id}
            role="alert"
            initial={{ opacity: 0, y: -28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.96 }}
            transition={{ type: "spring", damping: 26, stiffness: 340 }}
            className={`gp-toast pointer-events-auto relative w-full max-w-[380px] overflow-hidden rounded-2xl border backdrop-blur-2xl ${cfg.glow}`}
          >
            <div className={`absolute inset-0 opacity-[0.12] bg-gradient-to-r ${cfg.accent}`} />
            <div className="relative flex items-start gap-3.5 p-4 pr-10">
              <ToastIconBadge type={toast.type} />
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div className={`w-4 h-4 rounded-md bg-gradient-to-br ${cfg.accent} flex items-center justify-center`}>
                    <HeaderIcon className="w-2.5 h-2.5 text-white" strokeWidth={2.8} />
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r ${cfg.accent} bg-clip-text text-transparent`}>
                    Garuda Prime ◈ {labels[toast.type]}
                  </span>
                </div>
                <p className="gp-text text-sm font-semibold leading-snug">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="absolute top-3 right-3 w-7 h-7 rounded-lg gp-subtle flex items-center justify-center gp-muted hover:gp-text transition-colors"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="h-[3px] gp-toast-track mx-3 mb-3 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full bg-gradient-to-r ${cfg.bar}`}
                style={{ width: `${progress}%` }}
                transition={{ duration: 0.05 }}
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
