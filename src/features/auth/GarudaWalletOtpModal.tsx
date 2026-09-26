import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Mail, X } from "lucide-react";
import { useLanguage } from "../../app/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import { OTPVerification } from "./components/OTPVerification";
import {
  clearDemoEmailWalletOtp,
  maskEmailAddress,
  sendDemoEmailWalletOtp,
  verifyDemoEmailWalletOtp,
} from "../../lib/auth/emailWalletOtpService";
import {
  sendGarudaWalletCreateOtp,
  verifyGarudaWalletCreateOtp,
} from "../../lib/web3/garudaWalletOtpApi";
import { isEmbeddedWalletDemoMode } from "../../lib/web3/embeddedWalletConfig";
import { isPayHubApiConfigured } from "../../lib/payhub/payHubApi";
import { clearGarudaServerAddressCache } from "../../lib/web3/garudaNativeSession";
import { resolveFirebaseAuthToast } from "../../lib/firebase/authErrors";
import type { ConnectedWallet } from "../../lib/web3/walletService";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: (wallet: ConnectedWallet) => void;
  onError?: (err: unknown) => void;
};

const FALLBACK_WALLET_OTP = {
  title: "Verifikasi OTP Dompet",
  subtitle: "Kode 6 digit dikirim ke {email}",
  sendCode: "Kirim kode OTP",
  verifyContinue: "Verifikasi & buat dompet",
  creating: "Membuat dompet Garuda Prime…",
  noEmail: "Email akun diperlukan untuk membuat dompet Garuda Prime",
  invalidOtp: "Kode OTP salah atau kedaluwarsa",
};

export function GarudaWalletOtpModal({ open, onClose, onSuccess, onError }: Props) {
  const { t, lang } = useLanguage();
  const labels = t.toast.walletOtp ?? FALLBACK_WALLET_OTP;
  const auth = t.auth;
  const toast = t.toast;
  const { user, userProfile, linkEmbeddedGarudaWallet } = useAuth();

  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [maskedEmail, setMaskedEmail] = useState("");
  const [resendSec, setResendSec] = useState(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sent, setSent] = useState(false);
  const [inlineError, setInlineError] = useState("");

  const userEmail = user?.email?.trim() || userProfile?.email?.trim() || "";

  const resetState = useCallback(() => {
    setOtp(Array(6).fill(""));
    setResendSec(0);
    setLoading(false);
    setCreating(false);
    setSent(false);
    clearDemoEmailWalletOtp();
    clearGarudaServerAddressCache();
    setInlineError("");
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }
    if (userEmail) {
      setMaskedEmail(maskEmailAddress(userEmail));
    }
  }, [open, userEmail, resetState]);

  useEffect(() => {
    if (!open || resendSec <= 0) return;
    const timer = window.setInterval(() => {
      setResendSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open, resendSec]);

  const sendOtp = useCallback(async () => {
    if (!userEmail.includes("@")) {
      onError?.(new Error(labels.noEmail));
      return;
    }
    setLoading(true);
    setInlineError("");
    try {
      const useDemo = isEmbeddedWalletDemoMode() || !isPayHubApiConfigured();
      if (useDemo) {
        const demo = await sendDemoEmailWalletOtp(userEmail);
        setResendSec(demo.resendSec);
      } else {
        const result = await sendGarudaWalletCreateOtp(lang === "en" ? "en" : "id");
        setMaskedEmail(result.maskedEmail);
        setResendSec(result.resendSec);
      }
      setSent(true);
    } catch (err) {
      const msg = resolveFirebaseAuthToast(err, toast);
      setInlineError(msg);
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }, [userEmail, lang, labels.noEmail, onError]);

  useEffect(() => {
    if (!open || !userEmail.includes("@") || sent || loading) return;
    const timer = window.setTimeout(() => {
      void sendOtp();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [open, userEmail, sent, loading, sendOtp]);

  const handleVerify = async () => {
    const code = otp.join("");
    if (code.length !== 6) {
      const msg = toast.otpRequired ?? "Masukkan 6 digit OTP";
      setInlineError(msg);
      onError?.(new Error(msg));
      return;
    }
    if (!userEmail.includes("@")) {
      setInlineError(labels.noEmail);
      onError?.(new Error(labels.noEmail));
      return;
    }

    setLoading(true);
    setInlineError("");
    try {
      const useDemo = isEmbeddedWalletDemoMode() || !isPayHubApiConfigured();
      let otpSession: string | undefined;

      if (useDemo) {
        if (!verifyDemoEmailWalletOtp(userEmail, code)) {
          throw new Error(toast.authInvalidOtp ?? labels.invalidOtp);
        }
        clearDemoEmailWalletOtp();
      } else {
        const verified = await verifyGarudaWalletCreateOtp(code);
        otpSession = verified.otpSession?.trim();
        if (!otpSession) {
          throw Object.assign(
            new Error("Sesi OTP tidak valid, kirim ulang kode dan coba lagi"),
            { code: "garuda/otp-required" },
          );
        }
      }

      setCreating(true);
      const wallet = await linkEmbeddedGarudaWallet({ otpSession });
      onSuccess(wallet);
      onClose();
    } catch (err) {
      const msg = resolveFirebaseAuthToast(err, toast);
      setInlineError(msg);
      onError?.(err);
    } finally {
      setLoading(false);
      setCreating(false);
    }
  };

  const subtitle = labels.subtitle.replace("{email}", maskedEmail || userEmail || "-");

  if (!open) return null;

  return (
    <AnimatePresence>
        <>
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] gp-overlay-backdrop"
          />
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[61] mx-auto max-w-md gp-modal-sheet rounded-3xl border shadow-2xl overflow-hidden"
          >
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-emerald-400" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="gp-text text-base font-bold">{labels.title}</h3>
                    <p className="gp-muted text-xs mt-1 leading-relaxed">{subtitle}</p>
                  </div>
                </div>
                <button type="button" onClick={onClose} className="gp-icon-btn gp-icon-btn--compact shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {inlineError && (
                <p className="text-xs text-red-400/95 leading-relaxed px-0.5">{inlineError}</p>
              )}

              <OTPVerification
                otp={otp}
                loading={loading || creating}
                resendSec={resendSec}
                labels={{
                  resendOtp: auth.resendOtp,
                  resendNow: auth.resendNow,
                  verifyContinue: creating ? labels.creating : labels.verifyContinue,
                }}
                onOtpChange={(i, v) => {
                  setOtp((prev) => {
                    const next = [...prev];
                    next[i] = v;
                    return next;
                  });
                }}
                onResend={() => void sendOtp()}
                onVerify={() => void handleVerify()}
              />

              {!sent && (
                <button
                  type="button"
                  onClick={() => void sendOtp()}
                  disabled={loading}
                  className="w-full text-center text-xs text-emerald-400 font-medium py-1"
                >
                  {labels.sendCode}
                </button>
              )}
            </div>
          </motion.div>
        </>
    </AnimatePresence>
  );
}
