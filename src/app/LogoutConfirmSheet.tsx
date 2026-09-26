import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { LogOut, X } from "lucide-react";
import { useLanguage } from "./LanguageContext";

export const LogoutConfirmSheet = ({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) => {
  const { t } = useLanguage();
  const l = t.logout;

  const handleConfirm = () => {
    onClose();
    onConfirm();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 gp-overlay-panel z-[120]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="fixed bottom-0 left-0 right-0 z-[120] gp-modal-sheet border-t rounded-t-3xl mx-auto max-w-lg shadow-2xl"
          >
            <div className="gp-modal-handle w-10 h-1 rounded-full mx-auto mt-3 mb-2" />
            <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center shrink-0">
                    <LogOut className="w-5 h-5 text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="gp-text font-bold text-base leading-tight">{l.title}</h3>
                    <p className="gp-muted text-xs mt-1.5 leading-relaxed">{l.message}</p>
                  </div>
                </div>
                <button type="button" onClick={onClose} className="gp-muted gp-icon-btn p-1 shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl gp-pill text-sm font-semibold"
                >
                  {l.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                  <LogOut className="w-4 h-4" />
                  {l.confirm}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
};
