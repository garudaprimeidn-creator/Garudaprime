import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, KeyRound, Shield, Wallet } from "lucide-react";
import {
  generateGarudaRecoveryPhrase,
  recoveryPhraseToAddress,
  type GarudaPhraseLength,
} from "../../lib/wallet/garudaRecoveryPhrase";
import { formatWalletAddressShort } from "../../lib/web3/connectedWalletUtils";
import { GarudaWalletPhraseDisplay } from "./GarudaWalletPhraseDisplay";
import { WalletSheetActions } from "./WalletSheetActions";
import {
  WalletLoginSectionHead,
  WalletLoginStepProgress,
} from "../auth/WalletLoginUi";

export type GarudaWalletCreateResult = {
  phrase: string;
  pin: string;
  address: string;
  wordCount: GarudaPhraseLength;
};

type Props = {
  onComplete: (result: GarudaWalletCreateResult) => void | Promise<void>;
  onBack: () => void;
  busy?: boolean;
  /** When false, skip PIN step (e.g. registration sets PIN on security step). */
  includePinStep?: boolean;
  labels: {
    stepLength: string;
    stepLengthHint: string;
    words12: string;
    words12Desc: string;
    words24: string;
    words24Desc: string;
    recommended: string;
    stepPhrase: string;
    stepPhraseHint: string;
    stepPin: string;
    stepPinHint: string;
    warningTitle: string;
    warningBody: string;
    copyPhrase: string;
    showPhrase: string;
    hidePhrase: string;
    confirmSaved: string;
    confirmCheck: string;
    pin: string;
    confirmPin: string;
    pinPlaceholder: string;
    pinMismatch: string;
    pinTooShort: string;
    next: string;
    back: string;
    createBtn: string;
    selfCustodyNote: string;
  };
};

type Step = "length" | "phrase" | "pin";

const pinInputClass = "gp-login-wallet-sheet__pin-input";

export function GarudaWalletCreateFlow({
  onComplete,
  onBack,
  busy = false,
  includePinStep = true,
  labels,
}: Props) {
  const [step, setStep] = useState<Step>("length");
  const [wordCount, setWordCount] = useState<GarudaPhraseLength>(24);
  const [phrase, setPhrase] = useState("");
  const [showPhrase, setShowPhrase] = useState(false);
  const [savedConfirm, setSavedConfirm] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");

  const address = useMemo(
    () => (phrase ? recoveryPhraseToAddress(phrase) : ""),
    [phrase],
  );

  const steps = useMemo(() => {
    const base = [
      { id: "length", label: labels.stepLength },
      { id: "phrase", label: labels.stepPhrase },
    ];
    if (includePinStep) base.push({ id: "pin", label: labels.stepPin });
    return base;
  }, [includePinStep, labels.stepLength, labels.stepPhrase, labels.stepPin]);

  const stepIndex = step === "length" ? 0 : step === "phrase" ? 1 : 2;

  const sectionMeta = step === "length" ? labels.selfCustodyNote : undefined;
  const sectionTitle = step === "length" ? labels.stepLength : step === "phrase" ? labels.stepPhrase : labels.stepPin;
  const sectionHint = step === "length" ? labels.stepLengthHint : step === "phrase" ? labels.stepPhraseHint : labels.stepPinHint;

  const startPhraseStep = (count: GarudaPhraseLength) => {
    setWordCount(count);
    setPhrase(generateGarudaRecoveryPhrase(count));
    setShowPhrase(false);
    setSavedConfirm(false);
    setStep("phrase");
  };

  const handleCopy = async () => {
    if (!phrase) return;
    try {
      await navigator.clipboard.writeText(phrase);
    } catch {
      /* ignore */
    }
  };

  const finishCreate = async (pinValue: string) => {
    await onComplete({ phrase, pin: pinValue, address, wordCount });
  };

  const handlePinSubmit = async () => {
    setError("");
    if (pin.length < 4) {
      setError(labels.pinTooShort);
      return;
    }
    if (pin !== confirmPin) {
      setError(labels.pinMismatch);
      return;
    }
    await finishCreate(pin);
  };

  const handlePhraseNext = () => {
    if (includePinStep) {
      setStep("pin");
      return;
    }
    void finishCreate("");
  };

  return (
    <div className="gp-login-wallet-sheet__create gp-recovery-flow gp-recovery-flow--compact space-y-4">
      <WalletLoginStepProgress current={stepIndex + 1} total={steps.length} />

      <WalletLoginSectionHead
        icon={Wallet}
        title={sectionTitle}
        hint={sectionHint}
        meta={sectionMeta}
        address={address && step !== "length" ? formatWalletAddressShort(address) : undefined}
      />

      <AnimatePresence mode="wait">
        {step === "length" && (
          <motion.div
            key="length"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            className="gp-login-wallet-sheet__step space-y-4"
          >
            <div className="gp-wallet-option-list">
              <button
                type="button"
                onClick={() => startPhraseStep(12)}
                className="gp-wallet-option-row"
              >
                <span className="gp-wallet-option-row__icon gp-wallet-option-row__icon--words">
                  <KeyRound className="w-4 h-4 text-zinc-400" strokeWidth={2} />
                </span>
                <span className="gp-wallet-option-row__body">
                  <span className="gp-wallet-option-row__title">{labels.words12}</span>
                  <span className="gp-wallet-option-row__desc">{labels.words12Desc}</span>
                </span>
                <ChevronRight className="gp-wallet-option-row__chevron" strokeWidth={2} />
              </button>

              <button
                type="button"
                onClick={() => startPhraseStep(24)}
                className="gp-wallet-option-row gp-wallet-option-row--active"
              >
                <span className="gp-wallet-option-row__icon gp-wallet-option-row__icon--words">
                  <Shield className="w-4 h-4 text-emerald-400" strokeWidth={2} />
                </span>
                <span className="gp-wallet-option-row__body">
                  <span className="gp-wallet-option-row__title-row">
                    <span className="gp-wallet-option-row__title">{labels.words24}</span>
                    <span className="gp-wallet-option-row__badge">{labels.recommended}</span>
                  </span>
                  <span className="gp-wallet-option-row__desc">{labels.words24Desc}</span>
                </span>
                <ChevronRight className="gp-wallet-option-row__chevron" strokeWidth={2} />
              </button>
            </div>

            <button type="button" onClick={onBack} className="gp-login-wallet-sheet__back-full gp-pill">
              <ChevronLeft className="w-4 h-4 shrink-0" strokeWidth={2.5} />
              {labels.back}
            </button>
          </motion.div>
        )}

        {step === "phrase" && phrase && (
          <motion.div
            key="phrase"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            className="gp-login-wallet-sheet__step space-y-4"
          >
            <GarudaWalletPhraseDisplay
              phrase={phrase}
              showPhrase={showPhrase}
              onToggleShow={() => setShowPhrase((v) => !v)}
              onCopy={() => void handleCopy()}
              warningTitle={labels.warningTitle}
              warningBody={labels.warningBody}
              copyLabel={labels.copyPhrase}
              showLabel={labels.showPhrase}
              hideLabel={labels.hidePhrase}
            />

            <label className="gp-login-wallet-sheet__confirm-row">
              <input
                type="checkbox"
                checked={savedConfirm}
                onChange={(e) => setSavedConfirm(e.target.checked)}
                className="gp-auth-checkbox w-4 h-4 shrink-0"
              />
              <span>{labels.confirmCheck}</span>
            </label>

            <div className="gp-login-wallet-sheet__actions">
              <WalletSheetActions
                backLabel={labels.back}
                onBack={() => setStep("length")}
                primaryLabel={includePinStep ? labels.next : labels.createBtn}
                onPrimary={() => void handlePhraseNext()}
                primaryDisabled={!savedConfirm || busy}
                primaryBusy={busy}
              />
            </div>
          </motion.div>
        )}

        {step === "pin" && (
          <motion.div
            key="pin"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            className="gp-login-wallet-sheet__step"
          >
            <div className="gp-login-wallet-sheet__input-panel gp-login-wallet-sheet__pin-grid">
              <label className="gp-login-wallet-sheet__field">
                <span className="gp-login-wallet-sheet__field-label">{labels.pin}</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 8)); setError(""); }}
                  className={pinInputClass}
                  placeholder={labels.pinPlaceholder}
                  autoComplete="new-password"
                />
              </label>
              <label className="gp-login-wallet-sheet__field">
                <span className="gp-login-wallet-sheet__field-label">{labels.confirmPin}</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={confirmPin}
                  onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 8)); setError(""); }}
                  className={pinInputClass}
                  placeholder={labels.pinPlaceholder}
                  autoComplete="new-password"
                />
              </label>
            </div>
            {error && <p className="gp-login-wallet-sheet__error">{error}</p>}
            <div className="gp-login-wallet-sheet__actions">
              <WalletSheetActions
                backLabel={labels.back}
                onBack={() => setStep("phrase")}
                primaryLabel={labels.createBtn}
                primaryDisabled={pin.length < 4 || confirmPin.length < 4}
                primaryBusy={busy}
                onPrimary={() => void handlePinSubmit()}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
