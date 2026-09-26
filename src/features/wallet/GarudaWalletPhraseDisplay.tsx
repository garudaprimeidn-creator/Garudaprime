import React from "react";
import { AlertTriangle, Copy, Eye, EyeOff } from "lucide-react";
import { splitRecoveryPhraseWords } from "../../lib/wallet/garudaRecoveryPhrase";

type Props = {
  phrase: string;
  showPhrase: boolean;
  onToggleShow: () => void;
  onCopy: () => void;
  warningTitle: string;
  warningBody: string;
  copyLabel: string;
  showLabel: string;
  hideLabel: string;
};

export function GarudaWalletPhraseDisplay({
  phrase,
  showPhrase,
  onToggleShow,
  onCopy,
  warningTitle,
  warningBody,
  copyLabel,
  showLabel,
  hideLabel,
}: Props) {
  const words = splitRecoveryPhraseWords(phrase);

  return (
    <div className="gp-login-wallet-sheet__phrase space-y-3">
      <div className="gp-login-wallet-sheet__warning">
        <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={2} />
        <div>
          <p className="gp-login-wallet-sheet__warning-title">{warningTitle}</p>
          <p className="gp-login-wallet-sheet__warning-body">{warningBody}</p>
        </div>
      </div>

      <div className="gp-login-wallet-sheet__phrase-tools">
        <button
          type="button"
          onClick={onToggleShow}
          className="gp-login-wallet-sheet__phrase-tool"
        >
          {showPhrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showPhrase ? hideLabel : showLabel}
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="gp-login-wallet-sheet__phrase-tool"
        >
          <Copy className="w-3.5 h-3.5" />
          {copyLabel}
        </button>
      </div>

      <div className={`gp-recovery-flow__grid gp-login-wallet-sheet__phrase-grid${showPhrase ? "" : " gp-recovery-flow__grid--blur"}`}>
        {words.map((word, i) => (
          <span key={`${word}-${i}`} className="gp-recovery-flow__word">
            <span className="gp-recovery-flow__word-no">{i + 1}</span>
            {word}
          </span>
        ))}
      </div>
    </div>
  );
}
