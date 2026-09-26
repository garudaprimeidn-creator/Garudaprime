import type { RecoveryFlowLabels } from "./recoveryFlowTypes";

type ProfileDict = Record<string, string>;

export function buildRecoveryFlowLabels(pd: ProfileDict): RecoveryFlowLabels {
  return {
    stepPassword: pd.walletBackupStepPassword,
    stepPasswordHint: pd.walletBackupStepPasswordHint,
    stepPhrase: pd.walletBackupStepPhrase,
    stepPhraseHint: pd.walletBackupStepPhraseHint,
    stepUnlock: pd.walletRecoveryUnlock,
    stepUnlockHint: pd.walletRecoveryUnlockHint,
    passwordLabel: pd.walletRecoveryPasswordLabel,
    passwordPlaceholder: pd.walletRecoveryPasswordPlaceholder,
    continueBtn: pd.walletRecoveryContinue,
    unlockBtn: pd.walletRecoveryUnlockBtn,
    copyPhrase: pd.walletRecoveryCopyPhrase,
    copied: pd.walletRecoveryCopied,
    confirmSaved: pd.walletRecoveryConfirmSaved,
    hidePhrase: pd.walletRecoveryHidePhrase,
    showPhrase: pd.walletRecoveryShowPhrase,
    phraseEnterLabel: pd.walletRecoveryPhraseEnterLabel,
    phraseEnterPlaceholder: pd.walletRecoveryPhraseEnterPlaceholder,
    pinRequired: pd.walletRecoveryPinRequired,
    pinRequiredBody: pd.walletRecoveryPinRequiredBody,
    invalidPin: pd.walletRecoveryInvalidPin,
    invalidPhrase: pd.walletRecoveryInvalidPhrase,
    exportFailed: pd.walletRecoveryExportFailed,
    unlockSuccess: pd.walletRecoveryUnlockSuccess,
    autoHideNote: pd.walletBackupAutoHide,
    warningTitle: pd.walletBackupWarningTitle,
    warningBody: pd.walletBackupWarningBody,
  };
}
