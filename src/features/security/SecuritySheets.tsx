import React, { useState, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, Shield, Fingerprint, Lock, Copy, Check, ChevronLeft } from "lucide-react";
import {
  InputOTP, InputOTPGroup, InputOTPSlot,
} from "../../app/components/ui/input-otp";
import {
  generateTotpSecret, verifyTotp, buildTotpUri, formatTotpSecret,
} from "../../lib/security/totp";
import {
  saveTotpSecret, setTwoFactorEnabledLocal, syncSecurityPrefsToFirestore,
  savePasskeyCredential, setBiometricEnabledLocal, verifyAppPinAsync, hasAppPin, setAppPin,
} from "../../lib/security/securityStore";
import {
  registerPlatformPasskey, isWebAuthnSupported, authenticatePlatformPasskey,
} from "../../lib/security/webAuthn";
import { loadPasskeyCredential } from "../../lib/security/securityStore";
import { verifyTotp as verifyTotpFn } from "../../lib/security/totp";
import { loadTotpSecret } from "../../lib/security/securityStore";

/* ─── 2FA Setup ─────────────────────────────────────────────────────────── */

export const TwoFactorSetupSheet = ({
  open, onClose, uid, accountLabel, labels, onEnabled,
}: {
  open: boolean;
  onClose: () => void;
  uid: string;
  accountLabel: string;
  labels: Record<string, string>;
  onEnabled: () => void;
}) => {
  const [secret] = useState(() => generateTotpSecret());
  const [code, setCode] = useState("");
  const [stepIdx, setStepIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const uri = buildTotpUri(secret, accountLabel);
  const steps = useMemo(() => ([
    { id: "qr", label: labels.stepQr ?? "Scan QR" },
    { id: "verify", label: labels.stepVerify ?? "Verify" },
  ]), [labels.stepQr, labels.stepVerify]);
  const onQrStep = stepIdx === 0;

  useEffect(() => {
    if (!open) return;
    setStepIdx(0);
    setCode("");
    setError("");
    setCopied(false);
  }, [open]);

  const handleEnable = async () => {
    setError("");
    setBusy(true);
    try {
      const ok = await verifyTotp(secret, code);
      if (!ok) {
        setError(labels.invalidCode ?? "Invalid code");
        return;
      }
      saveTotpSecret(uid, secret);
      setTwoFactorEnabledLocal(uid, true);
      await syncSecurityPrefsToFirestore(uid, { twoFactorEnabled: true });
      onEnabled();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const copySecret = () => {
    void navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) return null;

  return (
    <SecuritySheet
      open={open}
      title={labels.title ?? "2FA Setup"}
      onClose={onClose}
      steps={steps}
      stepIndex={stepIdx}
    >
      <p className="gp-muted text-xs leading-relaxed">{labels.intro}</p>
      <AnimatePresence mode="wait">
        {onQrStep ? (
          <motion.div
            key="qr"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.22 }}
            className="space-y-3"
          >
            <div className="flex justify-center py-2">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(uri)}`}
                alt="QR"
                className="rounded-xl border gp-divider"
                width={160}
                height={160}
              />
            </div>
            <button type="button" onClick={copySecret} className="w-full flex items-center justify-center gap-2 py-2 rounded-xl gp-subtle text-xs font-mono gp-text">
              {formatTotpSecret(secret)}
              {copied ? <Check className="w-3.5 h-3.5 gp-read-emerald" /> : <Copy className="w-3.5 h-3.5 gp-muted" />}
            </button>
            <p className="gp-muted text-[10px] text-center">{labels.scanHint}</p>
            <button
              type="button"
              onClick={() => { setError(""); setStepIdx(1); }}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm"
            >
              {labels.next ?? "Continue"}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="verify"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.22 }}
            className="space-y-3"
          >
            <div className="flex flex-col items-center gap-2 pt-1">
              <InputOTP maxLength={6} value={code} onChange={setCode}>
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              {error && <p className="text-[11px] text-red-500">{error}</p>}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setError(""); setStepIdx(0); }}
                className="flex-1 py-3 rounded-xl gp-pill text-sm font-semibold flex items-center justify-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                {labels.back ?? "Back"}
              </button>
              <button
                type="button"
                disabled={busy || code.length < 6}
                onClick={() => void handleEnable()}
                className="flex-[1.4] py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm disabled:opacity-50"
              >
                {busy ? labels.enabling : labels.enable}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SecuritySheet>
  );
};

/* ─── Biometric Setup ───────────────────────────────────────────────────── */

export const BiometricSetupSheet = ({
  open, onClose, uid, displayName, labels, onEnabled,
}: {
  open: boolean;
  onClose: () => void;
  uid: string;
  displayName: string;
  labels: Record<string, string>;
  onEnabled: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supported = isWebAuthnSupported();

  const handleRegister = async () => {
    setError("");
    setBusy(true);
    try {
      const credId = await registerPlatformPasskey(uid, displayName);
      savePasskeyCredential(uid, credId);
      setBiometricEnabledLocal(uid, true);
      await syncSecurityPrefsToFirestore(uid, { biometricEnabled: true });
      onEnabled();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : labels.failed;
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <SecuritySheet open={open} title={labels.title ?? "Biometric Login"} onClose={onClose} icon={<Fingerprint className="w-5 h-5 gp-read-cyan" />}>
      <p className="gp-muted text-xs leading-relaxed">{labels.intro}</p>
      {!supported && (
        <p className="text-[11px] text-amber-600 mt-2">{labels.unsupported}</p>
      )}
      {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}
      <button
        type="button"
        disabled={busy || !supported}
        onClick={() => void handleRegister()}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm disabled:opacity-50 mt-3"
      >
        {busy ? labels.enabling : labels.enable}
      </button>
    </SecuritySheet>
  );
};

/* ─── Security challenge (sensitive actions / app unlock) ───────────────── */

export const SecurityChallengeSheet = ({
  open, onClose, uid, labels, onVerified,
}: {
  open: boolean;
  onClose: () => void;
  uid: string;
  labels: Record<string, string>;
  onVerified: () => void;
}) => {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const has2fa = Boolean(loadTotpSecret(uid));
  const hasBio = Boolean(loadPasskeyCredential(uid));
  const hasPin = hasAppPin();

  useEffect(() => {
    if (!open) return;
    setCode("");
    setPin("");
    setError("");
  }, [open]);

  const verify = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      if (has2fa && code.length === 6) {
        const secret = loadTotpSecret(uid)!;
        const ok = await verifyTotpFn(secret, code);
        if (ok) { onVerified(); onClose(); return; }
      }
      if (hasPin && pin.length >= 4) {
        if (await verifyAppPinAsync(pin)) { onVerified(); onClose(); return; }
      }
      setError(labels.invalid ?? "Verification failed");
    } finally {
      setBusy(false);
    }
  }, [has2fa, hasPin, code, pin, uid, labels.invalid, onVerified, onClose]);

  const unlockBio = async () => {
    setBusy(true);
    try {
      const cred = loadPasskeyCredential(uid);
      if (!cred) return;
      const ok = await authenticatePlatformPasskey(cred);
      if (ok) { onVerified(); onClose(); }
      else setError(labels.invalid ?? "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <SecuritySheet open={open} title={labels.title ?? "Verify Identity"} onClose={onClose} icon={<Lock className="w-5 h-5 gp-read-emerald" />}>
      <p className="gp-muted text-xs leading-relaxed">{labels.intro}</p>
      {has2fa && (
        <div className="flex flex-col items-center gap-2 py-3">
          <p className="text-[10px] gp-muted uppercase tracking-wider">{labels.totpLabel}</p>
          <InputOTP maxLength={6} value={code} onChange={setCode}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
      )}
      {hasPin && (
        <div className="py-2">
          <p className="text-[10px] gp-muted uppercase tracking-wider mb-2">{labels.pinLabel}</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="w-full text-center text-lg tracking-[0.5em] py-3 rounded-xl border gp-glass gp-text outline-none"
            placeholder="••••"
          />
        </div>
      )}
      {hasBio && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void unlockBio()}
          className="w-full py-2.5 rounded-xl border gp-glass text-sm font-semibold gp-text flex items-center justify-center gap-2"
        >
          <Fingerprint className="w-4 h-4 gp-read-cyan" />
          {labels.biometric}
        </button>
      )}
      {error && <p className="text-[11px] text-red-500 text-center">{error}</p>}
      <button
        type="button"
        disabled={busy || (has2fa && code.length < 6 && !pin)}
        onClick={() => void verify()}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm disabled:opacity-50 mt-2"
      >
        {labels.confirm}
      </button>
    </SecuritySheet>
  );
};

/* ─── MFA login screen ──────────────────────────────────────────────────── */

export const MfaLoginScreen = ({
  uid, accountLabel, labels, onVerified,
}: {
  uid: string;
  accountLabel: string;
  labels: Record<string, string>;
  onVerified: () => void;
}) => {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const secret = loadTotpSecret(uid);
      if (!secret) { setError(labels.noSecret ?? "2FA not configured"); return; }
      const ok = await verifyTotpFn(secret, code);
      if (!ok) { setError(labels.invalidCode ?? "Invalid code"); return; }
      onVerified();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 p-6 justify-center">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto rounded-2xl gp-subtle flex items-center justify-center mb-3">
          <Shield className="w-7 h-7 gp-read-emerald" />
        </div>
        <h2 className="gp-text font-bold text-lg">{labels.title}</h2>
        <p className="gp-muted text-xs mt-1">{labels.subtitle} {accountLabel}</p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <InputOTP maxLength={6} value={code} onChange={setCode}>
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
        {error && <p className="text-[11px] text-red-500">{error}</p>}
      </div>
      <button
        type="button"
        disabled={busy || code.length < 6}
        onClick={() => void submit()}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm disabled:opacity-50 mt-6"
      >
        {busy ? labels.verifying : labels.verify}
      </button>
    </div>
  );
};

/* ─── App lock overlay ──────────────────────────────────────────────────── */

export const AppLockOverlay = ({
  uid, labels, onUnlocked,
}: {
  uid: string;
  labels: Record<string, string>;
  onUnlocked: () => void;
}) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const tryPin = async () => {
    if (await verifyAppPinAsync(pin)) {
      onUnlocked();
      setPin("");
      setError("");
    } else {
      setError(labels.invalid ?? "Wrong PIN");
    }
  };

  const tryBio = async () => {
    setBusy(true);
    try {
      const cred = loadPasskeyCredential(uid);
      if (!cred) return;
      const ok = await authenticatePlatformPasskey(cred);
      if (ok) onUnlocked();
      else setError(labels.invalid ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[270] gp-overlay-panel flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border gp-modal-sheet p-6 space-y-4">
        <div className="text-center">
          <Lock className="w-8 h-8 mx-auto gp-read-emerald mb-2" />
          <h2 className="gp-text font-bold">{labels.title}</h2>
          <p className="gp-muted text-xs mt-1">{labels.subtitle}</p>
        </div>
        {hasAppPin() && (
          <>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="w-full text-center text-xl tracking-[0.5em] py-3 rounded-xl border gp-glass gp-text outline-none"
              placeholder="••••"
            />
            <button type="button" onClick={tryPin} className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm">
              {labels.unlockPin}
            </button>
          </>
        )}
        {loadPasskeyCredential(uid) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void tryBio()}
            className="w-full py-2.5 rounded-xl border gp-glass text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Fingerprint className="w-4 h-4 gp-read-cyan" />
            {labels.unlockBio}
          </button>
        )}
        {error && <p className="text-[11px] text-red-500 text-center">{error}</p>}
      </div>
    </div>
  );
};

/* ─── PIN manage ────────────────────────────────────────────────────────── */

const pinInputClass =
  "w-full text-center text-xl tracking-[0.45em] py-3 rounded-xl border gp-glass gp-text outline-none focus:border-emerald-500/40";

export const PinManageSheet = ({
  open,
  onClose,
  labels,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  labels: Record<string, string>;
  onSaved: () => void;
}) => {
  const pinExists = hasAppPin();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [stepIdx, setStepIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const steps = useMemo(() => (
    pinExists
      ? [
          { id: "current", label: labels.current ?? "Current" },
          { id: "new", label: labels.newPin ?? "New PIN" },
          { id: "confirm", label: labels.confirm ?? "Confirm" },
        ]
      : [
          { id: "new", label: labels.newPin ?? "New PIN" },
          { id: "confirm", label: labels.confirm ?? "Confirm" },
        ]
  ), [pinExists, labels.current, labels.newPin, labels.confirm]);

  const activeStep = steps[stepIdx]?.id ?? "new";
  const onLastStep = stepIdx === steps.length - 1;

  useEffect(() => {
    if (!open) return;
    setCurrent("");
    setNext("");
    setConfirm("");
    setStepIdx(0);
    setError("");
  }, [open]);

  const handleSave = async () => {
    setError("");
    if (next.length < 4) {
      setError(labels.tooShort ?? "PIN must be at least 4 digits");
      return;
    }
    if (next !== confirm) {
      setError(labels.mismatch ?? "PIN confirmation does not match");
      return;
    }
    setBusy(true);
    try {
      await setAppPin(next);
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleNext = async () => {
    setError("");
    if (activeStep === "current") {
      if (current.length < 4) {
        setError(labels.wrong ?? "Current PIN is incorrect");
        return;
      }
      const ok = await verifyAppPinAsync(current);
      if (!ok) {
        setError(labels.wrong ?? "Current PIN is incorrect");
        return;
      }
      setStepIdx((i) => i + 1);
      return;
    }
    if (activeStep === "new") {
      if (next.length < 4) {
        setError(labels.tooShort ?? "PIN must be at least 4 digits");
        return;
      }
      setStepIdx((i) => i + 1);
      return;
    }
    if (next !== confirm) {
      setError(labels.mismatch ?? "PIN confirmation does not match");
      return;
    }
    await handleSave();
  };

  const stepValue = activeStep === "current" ? current : activeStep === "new" ? next : confirm;
  const canAdvance = stepValue.length >= 4;

  return (
    <SecuritySheet
      open={open}
      title={pinExists ? (labels.changeTitle ?? "Change PIN") : (labels.createTitle ?? "Set PIN")}
      onClose={onClose}
      icon={<Lock className="w-5 h-5 text-amber-400" />}
      steps={steps}
      stepIndex={stepIdx}
    >
      <p className="gp-muted text-xs leading-relaxed">{labels.intro}</p>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.22 }}
        >
          <label className="block space-y-2">
            <span className="text-[10px] gp-muted uppercase tracking-wide font-semibold">
              {activeStep === "current" ? labels.current : activeStep === "new" ? labels.newPin : labels.confirm}
            </span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={stepValue}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                if (activeStep === "current") setCurrent(v);
                else if (activeStep === "new") setNext(v);
                else setConfirm(v);
                setError("");
              }}
              className={pinInputClass}
              placeholder="••••"
              autoComplete={activeStep === "current" ? "current-password" : "new-password"}
              autoFocus
            />
          </label>
        </motion.div>
      </AnimatePresence>

      {error && <p className="text-[11px] text-red-500">{error}</p>}

      <div className="flex gap-2 pt-1">
        {stepIdx > 0 && (
          <button
            type="button"
            onClick={() => { setError(""); setStepIdx((i) => i - 1); }}
            className="flex-1 py-3 rounded-xl gp-pill text-sm font-semibold flex items-center justify-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            {labels.back ?? "Back"}
          </button>
        )}
        <button
          type="button"
          disabled={busy || !canAdvance}
          onClick={() => void handleNext()}
          className={`${stepIdx > 0 ? "flex-[1.4]" : "w-full"} py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm disabled:opacity-50`}
        >
          {busy ? labels.saving : onLastStep ? labels.save : (labels.next ?? "Continue")}
        </button>
      </div>
    </SecuritySheet>
  );
};

/* ─── Sheet shell ───────────────────────────────────────────────────────── */

type SheetStep = { id: string; label: string };

const SheetStepRail = ({ steps, stepIndex }: { steps: SheetStep[]; stepIndex: number }) => (
  <ol
    className="gp-sec-sheet__rail"
    style={{ "--gp-sec-steps": steps.length } as React.CSSProperties}
    aria-label="Progress"
  >
    {steps.map((step, index) => {
      const done = index < stepIndex;
      const active = index === stepIndex;
      const pending = index > stepIndex;
      const connectorDone = index <= stepIndex;

      return (
        <li
          key={step.id}
          className={`gp-sec-sheet__rail-item${done ? " gp-sec-sheet__rail-item--done" : ""}${active ? " gp-sec-sheet__rail-item--active" : ""}${pending ? " gp-sec-sheet__rail-item--pending" : ""}`}
          aria-current={active ? "step" : undefined}
        >
          <div className="gp-sec-sheet__rail-track">
            {index > 0 && (
              <span className={`gp-sec-sheet__rail-connector${connectorDone ? " gp-sec-sheet__rail-connector--done" : ""}`} aria-hidden />
            )}
            <span className="gp-sec-sheet__rail-marker" aria-hidden>
              {done ? (
                <Check className="w-2.5 h-2.5" strokeWidth={3} />
              ) : active ? (
                <span className="gp-sec-sheet__rail-dot gp-sec-sheet__rail-dot--pulse" />
              ) : (
                <span className="gp-sec-sheet__rail-num gp-num">{index + 1}</span>
              )}
            </span>
            {index < steps.length - 1 && (
              <span className={`gp-sec-sheet__rail-connector${done ? " gp-sec-sheet__rail-connector--done" : ""}`} aria-hidden />
            )}
          </div>
          <span className="gp-sec-sheet__rail-label">{step.label}</span>
        </li>
      );
    })}
  </ol>
);

const SecuritySheet = ({
  open,
  title,
  onClose,
  icon,
  children,
  steps,
  stepIndex = 0,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  steps?: SheetStep[];
  stepIndex?: number;
}) => {
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="sec-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 gp-overlay-panel z-[280]"
            onClick={onClose}
          />
          <motion.div
            key="sec-sheet-panel"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="fixed bottom-0 left-0 right-0 z-[280] gp-modal-sheet border-t rounded-t-3xl mx-auto max-w-lg max-h-[min(90vh,640px)] flex flex-col shadow-2xl"
          >
            <div className="gp-modal-handle w-10 h-1 rounded-full mx-auto mt-3 mb-2 shrink-0" />
            <div className="flex items-center justify-between px-5 pb-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {icon ?? <Shield className="w-5 h-5 gp-read-emerald shrink-0" />}
                <h3 className="gp-text font-bold text-base truncate">{title}</h3>
              </div>
              <button type="button" onClick={onClose} className="gp-muted p-1 shrink-0" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            {steps && steps.length > 1 && (
              <div className="px-5 pb-3 shrink-0">
                <SheetStepRail steps={steps} stepIndex={stepIndex} />
              </div>
            )}
            <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-3 overflow-y-auto min-h-0">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
};
