import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle, Check, Copy, Eye, EyeOff, KeyRound, Loader2, Lock, Shield, Wallet,
} from "lucide-react";
import { hasAppPin, verifyAppPinAsync } from "../../lib/security/securityStore";
import { exportGarudaPrimeWalletSecrets } from "../../lib/web3/garudaWalletExportApi";
import { verifyGarudaRecoveryAddress } from "../../lib/web3/garudaWalletRecoveryApi";
import {
  isValidGarudaRecoveryPhrase,
  normalizeRecoveryPhrase,
  recoveryPhraseMatchesAddress,
  recoveryPhraseToAddress,
  splitRecoveryPhraseWords,
} from "../../lib/wallet/garudaRecoveryPhrase";
import { grantGarudaSignWindow } from "../../lib/web3/garudaWalletSignGate";
import { isAppLocked, unlockApp } from "../../lib/security/appLock";
import { formatWalletAddressShort } from "../../lib/web3/connectedWalletUtils";

export type { RecoveryFlowLabels } from "./recoveryFlowTypes";
export type { RecoveryFlowMode } from "./GarudaWalletRecoveryFlow";

type Step = "password" | "phrase" | "phrase-enter" | "done";

type Props = {
  mode: RecoveryFlowMode;
  uid: string;
  garudaAddress: string;
  labels: RecoveryFlowLabels;
  showToast: (msg: string, type?: "info" | "success" | "warning" | "error") => void;
  onUnlockSuccess?: () => void;
  onBackupDone?: () => void;
  /** Sembunyikan alamat duplikat saat dompet sudah ditampilkan di panel induk. */
  hideAddress?: boolean;
  /** Sembunyikan header langkah saat dibungkus panel connect. */
  hideStepHeader?: boolean;
};

const AUTO_HIDE_MS = 90_000;

export function GarudaWalletRecoveryFlow({
  mode,
  uid,
  garudaAddress,
  labels,
  showToast,
  onUnlockSuccess,
  onBackupDone,
  hideAddress = false,
  hideStepHeader = false,
}: Props) {
  const initialStep: Step = mode === "unlock" ? "phrase-enter" : "password";
  const [step, setStep] = useState<Step>(initialStep);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phraseInput, setPhraseInput] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [showPhrase, setShowPhrase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hideTimerRef = useRef<number | null>(null);

  const clearPhrase = useCallback(() => {
    setRecoveryPhrase("");
    setShowPhrase(false);
    if (hideTimerRef.current != null) window.clearTimeout(hideTimerRef.current);
  }, []);

  useEffect(() => () => {
    if (hideTimerRef.current != null) window.clearTimeout(hideTimerRef.current);
  }, []);

  const scheduleAutoHide = () => {
    if (hideTimerRef.current != null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(clearPhrase, AUTO_HIDE_MS);
  };

  const verifyPassword = async (): Promise<boolean> => {
    if (!hasAppPin()) {
      setError(labels.pinRequiredBody);
      return false;
    }
    const ok = await verifyAppPinAsync(password);
    if (!ok) {
      setError(labels.invalidPin);
      return false;
    }
    setError("");
    if (isAppLocked()) unlockApp();
    grantGarudaSignWindow();
    return true;
  };

  const handleBackupPassword = async () => {
    if (password.length < 4) {
      setError(labels.invalidPin);
      return;
    }
    setBusy(true);
    try {
      const ok = await verifyPassword();
      if (!ok) return;
      const payload = await exportGarudaPrimeWalletSecrets(uid, garudaAddress);
      setRecoveryPhrase(payload.recoveryPhrase);
      setStep("phrase");
      setPassword("");
      scheduleAutoHide();
    } catch (err) {
      showToast(err instanceof Error ? err.message : labels.exportFailed, "error");
    } finally {
      setBusy(false);
    }
  };

  const handleUnlockSubmit = async () => {
    const normalized = normalizeRecoveryPhrase(phraseInput);
    if (!isValidGarudaRecoveryPhrase(normalized)) {
      setError(labels.invalidPhrase);
      return;
    }
    if (password.length < 4) {
      setError(labels.invalidPin);
      return;
    }
    setBusy(true);
    try {
      const pinOk = await verifyPassword();
      if (!pinOk) return;
      const derived = recoveryPhraseMatchesAddress(normalized, garudaAddress);
      if (!derived) {
        setError(labels.invalidPhrase);
        return;
      }
      const derivedAddress = recoveryPhraseToAddress(normalized, derived);
      await verifyGarudaRecoveryAddress(derivedAddress);
      grantGarudaSignWindow();
      setStep("done");
      setPassword("");
      setPhraseInput("");
      showToast(labels.unlockSuccess, "success");
      onUnlockSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.invalidPhrase);
    } finally {
      setBusy(false);
    }
  };

  const copyPhrase = async () => {
    if (!recoveryPhrase) return;
    try {
      await navigator.clipboard.writeText(recoveryPhrase);
      showToast(labels.copied, "success");
    } catch {
      showToast(labels.exportFailed, "error");
    }
  };

  const words = splitRecoveryPhraseWords(recoveryPhrase);

  const stepMeta = (() => {
    if (mode === "backup") {
      if (step === "password") return { title: labels.stepPassword, hint: labels.stepPasswordHint, n: 1 };
      if (step === "phrase") return { title: labels.stepPhrase, hint: labels.stepPhraseHint, n: 2 };
      return { title: labels.stepPhrase, hint: "", n: 2 };
    }
    if (step === "phrase-enter") return { title: labels.stepUnlock, hint: labels.stepUnlockHint, n: 1 };
    return { title: labels.stepUnlock, hint: labels.unlockSuccess, n: 2 };
  })();

  if (!hasAppPin() && step !== "done") {
    return (
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4 space-y-2">
        <div className="flex gap-3">
          <Lock className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-300/95">{labels.pinRequired}</p>
            <p className="text-xs gp-muted mt-1 leading-relaxed">{labels.pinRequiredBody}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gp-recovery-flow space-y-4">
      {!hideStepHeader && (
        <RecoveryStepHeader
          step={stepMeta.n}
          total={mode === "backup" ? 2 : 2}
          title={stepMeta.title}
          hint={stepMeta.hint}
          address={garudaAddress}
          hideAddress={hideAddress}
        />
      )}

      <AnimatePresence mode="wait">
        {step === "password" && (
          <motion.div
            key="password"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            className="gp-recovery-flow__panel space-y-3"
          >
            <label className="block space-y-2">
              <span className="text-[10px] uppercase tracking-wide gp-muted font-semibold">{labels.passwordLabel}</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  inputMode="numeric"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value.replace(/\D/g, "").slice(0, 8)); setError(""); }}
                  placeholder={labels.passwordPlaceholder}
                  className="w-full rounded-xl border gp-divider bg-black/20 px-4 py-3.5 pr-11 text-sm gp-text gp-num focus:outline-none focus:border-emerald-500/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 gp-muted p-1"
                  aria-label={showPassword ? labels.hidePhrase : labels.showPhrase}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="button"
              disabled={busy || password.length < 4}
              onClick={() => void handleBackupPassword()}
              className="w-full py-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {labels.continueBtn}
            </button>
          </motion.div>
        )}

        {step === "phrase" && recoveryPhrase && (
          <motion.div
            key="phrase"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            className="gp-recovery-flow__panel space-y-3"
          >
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-3 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-amber-300/95">{labels.warningTitle}</p>
                <p className="text-[10px] gp-muted mt-0.5 leading-relaxed">{labels.warningBody}</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] gp-muted">{labels.autoHideNote}</p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowPhrase((v) => !v)}
                  className="text-[10px] font-semibold text-emerald-400 px-2 py-1 rounded-lg border border-emerald-500/25 flex items-center gap-1"
                >
                  {showPhrase ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showPhrase ? labels.hidePhrase : labels.showPhrase}
                </button>
                <button
                  type="button"
                  onClick={() => void copyPhrase()}
                  className="text-[10px] font-semibold text-emerald-400 px-2 py-1 rounded-lg border border-emerald-500/25 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  {labels.copyPhrase}
                </button>
              </div>
            </div>

            <div className={`gp-recovery-flow__grid${showPhrase ? "" : " gp-recovery-flow__grid--blur"}`}>
              {words.map((word, i) => (
                <span key={`${word}-${i}`} className="gp-recovery-flow__word">
                  <span className="gp-recovery-flow__word-no">{i + 1}</span>
                  {word}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={() => { clearPhrase(); onBackupDone?.(); }}
              className="w-full py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              {labels.confirmSaved}
            </button>
          </motion.div>
        )}

        {step === "phrase-enter" && (
          <motion.div
            key="phrase-enter"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            className="gp-recovery-flow__panel space-y-3"
          >
            <label className="block space-y-2">
              <span className="text-[10px] uppercase tracking-wide gp-muted font-semibold">{labels.phraseEnterLabel}</span>
              <textarea
                value={phraseInput}
                onChange={(e) => { setPhraseInput(e.target.value); setError(""); }}
                placeholder={labels.phraseEnterPlaceholder}
                rows={4}
                spellCheck={false}
                autoCapitalize="off"
                className="w-full rounded-xl border gp-divider bg-black/20 px-3 py-3 text-xs gp-text leading-relaxed focus:outline-none focus:border-emerald-500/40 resize-none"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[10px] uppercase tracking-wide gp-muted font-semibold">{labels.passwordLabel}</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  inputMode="numeric"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value.replace(/\D/g, "").slice(0, 8)); setError(""); }}
                  placeholder={labels.passwordPlaceholder}
                  className="w-full rounded-xl border gp-divider bg-black/20 px-4 py-3.5 pr-11 text-sm gp-text gp-num focus:outline-none focus:border-emerald-500/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 gp-muted p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleUnlockSubmit()}
              className="w-full py-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              {labels.unlockBtn}
            </button>
          </motion.div>
        )}

        {step === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="gp-recovery-flow__panel gp-recovery-flow__done text-center py-6"
          >
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-3">
              <Check className="w-7 h-7 text-emerald-400" />
            </div>
            <p className="gp-text font-bold text-sm">{labels.unlockSuccess}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RecoveryStepHeader({
  step, total, title, hint, address, hideAddress = false,
}: {
  step: number;
  total: number;
  title: string;
  hint: string;
  address: string;
  hideAddress?: boolean;
}) {
  return (
    <div className="gp-recovery-flow__header">
      <div className="flex items-center gap-2 mb-3">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`gp-recovery-flow__dot${i + 1 <= step ? " gp-recovery-flow__dot--on" : ""}${i + 1 === step ? " gp-recovery-flow__dot--active" : ""}`}
          />
        ))}
        <span className="text-[10px] gp-muted ml-auto gp-num">{step}/{total}</span>
      </div>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
          <Wallet className="w-4 h-4 text-emerald-400" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="gp-text text-sm font-bold">{title}</p>
          {hint && <p className="gp-muted text-[11px] mt-0.5 leading-relaxed">{hint}</p>}
          {!hideAddress && (
            <p className="gp-num text-[10px] text-emerald-400/90 mt-1">{formatWalletAddressShort(address)}</p>
          )}
        </div>
      </div>
    </div>
  );
}
