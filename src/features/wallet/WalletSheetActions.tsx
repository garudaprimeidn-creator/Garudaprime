import React from "react";
import { ChevronLeft, Loader2 } from "lucide-react";

type Props = {
  backLabel: string;
  onBack: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
  primaryIcon?: React.ReactNode;
};

export function WalletSheetActions({
  backLabel,
  onBack,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryBusy = false,
  primaryIcon,
}: Props) {
  return (
    <div className="gp-wallet-sheet-actions">
      <button
        type="button"
        onClick={onBack}
        className="gp-wallet-sheet-actions__back gp-pill"
      >
        <ChevronLeft className="w-4 h-4 shrink-0" strokeWidth={2.5} />
        <span>{backLabel}</span>
      </button>
      <button
        type="button"
        disabled={primaryDisabled || primaryBusy}
        onClick={onPrimary}
        className="gp-wallet-sheet-actions__primary"
      >
        {primaryBusy ? (
          <Loader2 className="w-4 h-4 shrink-0 animate-spin" strokeWidth={2.5} />
        ) : (
          primaryIcon ? <span className="gp-wallet-sheet-actions__icon shrink-0">{primaryIcon}</span> : null
        )}
        <span className="gp-wallet-sheet-actions__label">{primaryLabel}</span>
      </button>
    </div>
  );
}
