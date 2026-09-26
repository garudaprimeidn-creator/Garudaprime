import React from "react";
import { ChevronRight, KeyRound, Loader2, Plus, ShieldCheck } from "lucide-react";
import { useLanguage } from "../../app/LanguageContext";

export type LoginWalletMode = "create" | "import";

type Props = {
  onChooseMode: (mode: LoginWalletMode) => void;
  busy: boolean;
};

export function LoginWalletSetup({ onChooseMode, busy }: Props) {
  const { t } = useLanguage();
  const lw = (t.auth as Record<string, unknown>).loginWallet as Record<string, string> | undefined;

  return (
    <div className="gp-login-wallet-sheet__pick">
      <div className="gp-login-wallet-sheet__intro">
        <p className="gp-login-wallet-sheet__kicker">
          {lw?.pickSection ?? "Self-custody · BIP39"}
        </p>
        <p className="gp-login-wallet-sheet__pick-hint">
          {lw?.pickSectionHint ?? "Buat frasa baru atau pulihkan dompet dengan frasa yang sudah ada."}
        </p>
      </div>

      <div className="gp-wallet-option-list gp-login-wallet-sheet__options">
          <button
            type="button"
            onClick={() => onChooseMode("create")}
            disabled={busy}
            className="gp-wallet-option-row gp-wallet-option-row--create w-full"
          >
            <span className="gp-wallet-option-row__icon gp-wallet-option-row__icon--create">
              <Plus className="w-5 h-5 text-emerald-400" strokeWidth={2.5} />
            </span>
            <span className="gp-wallet-option-row__body">
              <span className="gp-wallet-option-row__title-row">
                <span className="gp-wallet-option-row__title">
                  {lw?.createWallet ?? lw?.createBtn ?? "Buat Dompet Baru"}
                </span>
                {lw?.createWalletBadge && (
                  <span className="gp-wallet-option-row__badge">{lw.createWalletBadge}</span>
                )}
              </span>
              <span className="gp-wallet-option-row__desc">
                {lw?.createWalletDesc ?? "Generate frasa BIP39 12/24 kata · kompatibel MetaMask"}
              </span>
            </span>
            {busy ? (
              <Loader2 className="gp-wallet-option-row__chevron animate-spin" strokeWidth={2} />
            ) : (
              <ChevronRight className="gp-wallet-option-row__chevron" strokeWidth={2.5} />
            )}
          </button>

          <button
            type="button"
            onClick={() => onChooseMode("import")}
            disabled={busy}
            className="gp-wallet-option-row gp-wallet-option-row--import gp-wallet-option-row--import-pro w-full"
          >
            <span className="gp-wallet-option-row__icon gp-wallet-option-row__icon--import">
              <KeyRound className="w-5 h-5 text-sky-400" strokeWidth={2.5} />
            </span>
            <span className="gp-wallet-option-row__body">
              <span className="gp-wallet-option-row__title">
                {lw?.importWallet ?? "Pulihkan dengan Frasa"}
              </span>
              <span className="gp-wallet-option-row__desc">
                {lw?.importWalletDesc ?? "Masukkan frasa sandi dompet Garuda atau wallet Web3 lain"}
              </span>
            </span>
            {busy ? (
              <Loader2 className="gp-wallet-option-row__chevron animate-spin" strokeWidth={2} />
            ) : (
              <ChevronRight className="gp-wallet-option-row__chevron" strokeWidth={2.5} />
            )}
          </button>
      </div>

      <div className="gp-login-wallet-sheet__security-note">
        <span className="gp-login-wallet-sheet__security-icon" aria-hidden>
          <ShieldCheck className="w-4 h-4" strokeWidth={2} />
        </span>
        <p>{lw?.setupHint ?? "Self-custody penuh · frasa hanya di perangkat Anda. Garuda Prime tidak menyimpan seed phrase di server."}</p>
      </div>
    </div>
  );
}
