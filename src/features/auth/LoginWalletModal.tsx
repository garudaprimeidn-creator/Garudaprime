import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useLanguage } from "../../app/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import { showAppToast } from "../../app/appToast";
import { resolveFirebaseAuthToast } from "../../lib/firebase/authErrors";
import { LoginWalletSetup } from "./LoginWalletSetup";
import { isEmbeddedWalletEnabled } from "../../lib/web3/embeddedWalletConfig";
import {
  isValidGarudaRecoveryPhrase,
  normalizeRecoveryPhrase,
  recoveryPhraseImportPreview,
} from "../../lib/wallet/garudaRecoveryPhrase";
import { formatAddress } from "../../lib/web3/walletService";
import {
  GarudaWalletCreateFlow,
  type GarudaWalletCreateResult,
} from "../wallet/GarudaWalletCreateFlow";
import { WalletSheetActions } from "../wallet/WalletSheetActions";
import {
  WalletLoginSheetHeader,
  WalletLoginStepRail,
} from "./WalletLoginUi";

type WalletMode = "create" | "import";
type Step = "pick" | "create" | "import-phrase" | "import-pin";

type Props = {
  open: boolean;
  onClose: () => void;
};

const pinInputClass = "gp-login-wallet-sheet__pin-input";

function pickCreateFlowLabels(
  cf: Record<string, string> | undefined,
  lw: Record<string, string> | undefined,
): React.ComponentProps<typeof GarudaWalletCreateFlow>["labels"] {
  return {
    stepLength: cf?.stepLength ?? "Panjang frasa sandi",
    stepLengthHint: cf?.stepLengthHint ?? "Pilih 12 atau 24 kata · disarankan 24 untuk keamanan maksimal",
    words12: cf?.words12 ?? "12 kata",
    words12Desc: cf?.words12Desc ?? "Lebih ringkas, cocok untuk perangkat pribadi",
    words24: cf?.words24 ?? "24 kata",
    words24Desc: cf?.words24Desc ?? "Standar keamanan Garuda Prime",
    recommended: cf?.recommended ?? "Disarankan",
    stepPhrase: cf?.stepPhrase ?? "Simpan frasa sandi",
    stepPhraseHint: cf?.stepPhraseHint ?? "Salin dan simpan di tempat aman · ini satu-satunya cara memulihkan dompet",
    stepPin: cf?.stepPin ?? lw?.importPin ?? "Verifikasi PIN",
    stepPinHint: cf?.stepPinHint ?? lw?.importPinHint ?? "PIN 4-6 digit untuk mengamankan perangkat ini",
    warningTitle: cf?.warningTitle ?? "Jangan bagikan frasa sandi",
    warningBody: cf?.warningBody ?? "Siapa pun yang memiliki frasa ini dapat mengontrol dompet Anda. Garuda Prime tidak menyimpan frasa di server.",
    copyPhrase: cf?.copyPhrase ?? "Salin frasa",
    showPhrase: cf?.showPhrase ?? "Tampilkan",
    hidePhrase: cf?.hidePhrase ?? "Sembunyikan",
    confirmSaved: cf?.confirmSaved ?? "Saya sudah menyimpan frasa",
    confirmCheck: cf?.confirmCheck ?? "Saya sudah menulis frasa sandi di tempat aman dan offline",
    pin: lw?.pin ?? "PIN Transaksi",
    confirmPin: lw?.confirmPin ?? "Konfirmasi PIN",
    pinPlaceholder: "••••",
    pinMismatch: lw?.pinMismatch ?? "Konfirmasi PIN tidak cocok",
    pinTooShort: lw?.pinTooShort ?? "PIN minimal 4 digit",
    next: lw?.next ?? "Lanjut",
    back: lw?.back ?? "Kembali",
    createBtn: cf?.createBtn ?? lw?.createBtn ?? "Buat dompet",
    selfCustodyNote: cf?.selfCustodyNote ?? "Self-custody · private key Anda hanya ada di perangkat ini",
  };
}

export function LoginWalletModal({ open, onClose }: Props) {
  const { t } = useLanguage();
  const auth = t.auth;
  const reg = t.registration;
  const toast = t.toast as Record<string, string>;
  const lw = (auth as Record<string, unknown>).loginWallet as Record<string, string> | undefined;
  const cf = lw?.createFlow as Record<string, string> | undefined;

  const labels = useMemo(() => ({
    title: lw?.title ?? "Dompet Garuda Prime",
    subtitle: lw?.subtitle ?? "Buat dompet baru atau pulihkan dengan frasa sandi",
    importPhrase: lw?.importPhrase ?? "Frasa sandi",
    importPhraseHint: lw?.importPhraseHint ?? "Masukkan 12 atau 24 kata frasa pemulihan dompet Garuda Prime",
    importPin: lw?.importPin ?? "Verifikasi PIN",
    importPinHint: lw?.importPinHint ?? "PIN 4-6 digit untuk mengamankan perangkat ini",
    pin: lw?.pin ?? "PIN Transaksi",
    confirmPin: lw?.confirmPin ?? "Konfirmasi PIN",
    next: lw?.next ?? "Lanjut",
    back: lw?.back ?? "Kembali",
    importBtn: lw?.importBtn ?? "Masuk dengan dompet",
    phrasePlaceholder: lw?.phrasePlaceholder ?? "word1 word2 word3 …",
    pinPlaceholder: "••••",
    pinMismatch: lw?.pinMismatch ?? "Konfirmasi PIN tidak cocok",
    pinTooShort: lw?.pinTooShort ?? "PIN minimal 4 digit",
    invalidPhrase: lw?.invalidPhrase ?? "Frasa sandi tidak valid",
    walletReady: lw?.walletReady ?? "Dompet Garuda Prime siap",
    createFlow: pickCreateFlowLabels(cf, lw),
  }), [auth, lw, cf, reg]);

  const {
    loading,
    signInWithGarudaRecovery,
  } = useAuth();

  const [step, setStep] = useState<Step>("pick");
  const [busy, setBusy] = useState(false);

  const [phrase, setPhrase] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const reset = () => {
    setStep("pick");
    setBusy(false);
    setPhrase("");
    setPin("");
    setConfirmPin("");
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const closeAll = () => {
    reset();
    onClose();
  };

  const importPreview = useMemo(() => {
    const normalized = normalizeRecoveryPhrase(phrase);
    if (!isValidGarudaRecoveryPhrase(normalized)) return null;
    return recoveryPhraseImportPreview(normalized);
  }, [phrase]);

  const importSteps = useMemo(() => ([
    { id: "phrase", label: labels.importPhrase },
    { id: "pin", label: labels.importPin },
  ]), [labels.importPhrase, labels.importPin]);

  const importStepIndex = step === "import-phrase" ? 0 : step === "import-pin" ? 1 : 0;

  const handlePickMode = (next: WalletMode) => {
    setStep(next === "import" ? "import-phrase" : "create");
  };

  const handleImportPhraseNext = () => {
    const normalized = normalizeRecoveryPhrase(phrase);
    if (!isValidGarudaRecoveryPhrase(normalized)) {
      showAppToast(labels.invalidPhrase, "error");
      return;
    }
    setStep("import-pin");
  };

  const handleImportSubmit = async () => {
    if (pin.length < 4) {
      showAppToast(labels.pinTooShort, "error");
      return;
    }
    if (pin !== confirmPin) {
      showAppToast(labels.pinMismatch, "error");
      return;
    }
    setBusy(true);
    try {
      await signInWithGarudaRecovery(normalizeRecoveryPhrase(phrase), pin);
      showAppToast(labels.walletReady, "success");
      closeAll();
    } catch (e) {
      showAppToast(resolveFirebaseAuthToast(e, toast), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateComplete = async ({ phrase: newPhrase, pin: newPin }: GarudaWalletCreateResult) => {
    setBusy(true);
    try {
      await signInWithGarudaRecovery(newPhrase, newPin);
      showAppToast(labels.walletReady, "success");
      closeAll();
    } catch (e) {
      showAppToast(resolveFirebaseAuthToast(e, toast), "error");
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;

  if (!isEmbeddedWalletEnabled()) {
    return createPortal(
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 gp-overlay-panel z-[120]"
              onClick={closeAll}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="fixed bottom-0 left-0 right-0 z-[120] gp-modal-sheet border-t rounded-t-3xl mx-auto max-w-lg p-5"
            >
              <p className="gp-muted text-sm text-center">
                {reg.walletPremiumUnavailable ?? "Dompet Garuda Prime belum dikonfigurasi."}
              </p>
              <button type="button" onClick={closeAll} className="w-full mt-4 py-3 rounded-xl gp-pill text-sm font-semibold">
                {auth.forgot?.backToLogin ?? "Tutup"}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body,
    );
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 gp-overlay-panel z-[120]"
            onClick={closeAll}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="fixed bottom-0 left-0 right-0 z-[120] gp-modal-sheet gp-login-wallet-sheet border-t rounded-t-3xl mx-auto max-w-lg max-h-[min(92vh,720px)] flex flex-col shadow-2xl overflow-hidden"
          >
            <div className="gp-modal-handle gp-login-wallet-sheet__handle shrink-0" />
            <WalletLoginSheetHeader
              title={labels.title}
              subtitle={labels.subtitle}
              onClose={closeAll}
            />
            <div className="gp-login-wallet-sheet__header-divider" aria-hidden />

            {(step === "import-phrase" || step === "import-pin") && (
              <div className="gp-login-wallet-sheet__rail-wrap shrink-0">
                <WalletLoginStepRail steps={importSteps} activeIndex={importStepIndex} />
              </div>
            )}

            <div className="gp-login-wallet-sheet__body overflow-y-auto min-h-0 flex-1">
              <AnimatePresence mode="wait">
                {step === "pick" && (
                  <motion.div key="pick" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                    <LoginWalletSetup
                      onChooseMode={handlePickMode}
                      busy={busy}
                    />
                  </motion.div>
                )}

                {step === "create" && (
                  <motion.div key="create" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                    <GarudaWalletCreateFlow
                      labels={labels.createFlow}
                      busy={busy || loading}
                      onBack={() => setStep("pick")}
                      onComplete={handleCreateComplete}
                    />
                  </motion.div>
                )}

                {step === "import-phrase" && (
                  <motion.div key="import-phrase" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="gp-login-wallet-sheet__step">
                    <div className="gp-login-wallet-sheet__instruction">
                      <p className="gp-login-wallet-sheet__instruction-kicker">{labels.importPhrase}</p>
                      <p className="gp-login-wallet-sheet__lead">{labels.importPhraseHint}</p>
                    </div>
                    <div className="gp-login-wallet-sheet__input-panel">
                      <textarea
                        value={phrase}
                        onChange={(e) => setPhrase(e.target.value)}
                        placeholder={labels.phrasePlaceholder}
                        rows={5}
                        className="gp-login-wallet-sheet__phrase-input"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                    {importPreview && (
                      <div className="gp-login-wallet-sheet__preview">
                        <p className="gp-login-wallet-sheet__preview-label">
                          {importPreview.isExportStyle
                            ? (lw?.importPreviewExport ?? "Alamat dompet Garuda Premium (backup internal)")
                            : (lw?.importPreviewStandard ?? "Alamat dompet (MetaMask #1 / BIP44)")}
                        </p>
                        <p className="gp-login-wallet-sheet__preview-address gp-num">
                          {formatAddress(importPreview.preferred)}
                        </p>
                        {importPreview.isExportStyle && (
                          <p className="gp-login-wallet-sheet__preview-hint">
                            {lw?.importPreviewExportHint ?? "Frasa backup OTP bukan frasa MetaMask · gunakan Login Dompet, bukan import di MetaMask."}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="gp-login-wallet-sheet__actions">
                      <WalletSheetActions
                        backLabel={labels.back}
                        onBack={() => setStep("pick")}
                        primaryLabel={labels.next}
                        onPrimary={handleImportPhraseNext}
                      />
                    </div>
                  </motion.div>
                )}

                {step === "import-pin" && (
                  <motion.div key="import-pin" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="gp-login-wallet-sheet__step">
                    <div className="gp-login-wallet-sheet__instruction">
                      <p className="gp-login-wallet-sheet__instruction-kicker">{labels.importPin}</p>
                      <p className="gp-login-wallet-sheet__lead">{labels.importPinHint}</p>
                    </div>
                    <div className="gp-login-wallet-sheet__input-panel gp-login-wallet-sheet__pin-grid">
                      <label className="gp-login-wallet-sheet__field">
                        <span className="gp-login-wallet-sheet__field-label">{labels.pin}</span>
                        <input type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} className={pinInputClass} placeholder={labels.pinPlaceholder} autoComplete="new-password" />
                      </label>
                      <label className="gp-login-wallet-sheet__field">
                        <span className="gp-login-wallet-sheet__field-label">{labels.confirmPin}</span>
                        <input type="password" inputMode="numeric" maxLength={8} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 8))} className={pinInputClass} placeholder={labels.pinPlaceholder} autoComplete="new-password" />
                      </label>
                    </div>
                    <div className="gp-login-wallet-sheet__actions">
                      <WalletSheetActions
                        backLabel={labels.back}
                        onBack={() => setStep("import-phrase")}
                        primaryLabel={labels.importBtn}
                        primaryDisabled={pin.length < 4 || confirmPin.length < 4}
                        primaryBusy={busy || loading}
                        onPrimary={() => void handleImportSubmit()}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
