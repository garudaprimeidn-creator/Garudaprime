import React from "react";
import { ChevronRight, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { useLanguage } from "../../app/LanguageContext";
import { APP_ORIGIN } from "../../lib/app/branding";
import { isEmbeddedWalletEnabled } from "../../lib/web3/embeddedWalletConfig";

export type RegistrationWalletChoice = "otp" | "external";

type Props = {
  onChoose: (choice: RegistrationWalletChoice) => void;
  onWalletLoginInstead?: () => void;
  busy: boolean;
  /** External Web3 wallet, only when user has no Garuda Prime built-in wallet yet. */
  showExternalOption?: boolean;
};

export function RegistrationWalletSetup({
  onChoose,
  onWalletLoginInstead,
  busy,
  showExternalOption = true,
}: Props) {
  const { t } = useLanguage();
  const reg = t.registration as Record<string, string | undefined>;

  if (!isEmbeddedWalletEnabled()) {
    return (
      <p className="gp-muted text-xs text-center px-3 py-4 rounded-xl border border-amber-500/30 bg-amber-500/10">
        {reg.walletPremiumUnavailable ?? "Garuda Premium belum dikonfigurasi di server."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2.5">
        <button
          type="button"
          onClick={() => onChoose("otp")}
          disabled={busy}
          className="gp-wallet-option-row gp-wallet-option-row--create w-full"
        >
          <span className="gp-wallet-option-row__icon gp-wallet-option-row__icon--create">
            <img src={`${APP_ORIGIN}/favicon.png`} alt="" width={26} height={26} className="object-contain" />
          </span>
          <span className="gp-wallet-option-row__body">
            <span className="gp-wallet-option-row__title-row">
              <span className="gp-wallet-option-row__title">
                {reg.walletInternalTitle ?? "Garuda Prime Internal"}
              </span>
              {reg.createWalletBadge && (
                <span className="gp-wallet-option-row__badge">{reg.createWalletBadge}</span>
              )}
            </span>
            <span className="gp-wallet-option-row__desc">
              {reg.walletInternalDesc ?? "OTP email · tanpa frasa sandi · Pay Hub"}
            </span>
          </span>
          {busy ? (
            <Loader2 className="gp-wallet-option-row__chevron animate-spin" strokeWidth={2} />
          ) : (
            <ChevronRight className="gp-wallet-option-row__chevron" strokeWidth={2.5} />
          )}
        </button>

        {showExternalOption && (
        <button
          type="button"
          onClick={() => onChoose("external")}
          disabled={busy}
          className="gp-wallet-option-row gp-wallet-option-row--import w-full"
        >
          <span className="gp-wallet-option-row__icon gp-wallet-option-row__icon--import">
            <Wallet className="w-5 h-5 text-sky-400" strokeWidth={2.5} />
          </span>
          <span className="gp-wallet-option-row__body">
            <span className="gp-wallet-option-row__title">
              {reg.walletExternalTitle ?? "Dompet Eksternal"}
            </span>
            <span className="gp-wallet-option-row__desc">
              {reg.walletExternalDesc ?? "Hubungkan dompet Web3 yang terpasang di perangkat"}
            </span>
          </span>
          {busy ? (
            <Loader2 className="gp-wallet-option-row__chevron animate-spin" strokeWidth={2} />
          ) : (
            <ChevronRight className="gp-wallet-option-row__chevron" strokeWidth={2.5} />
          )}
        </button>
        )}
      </div>

      <div className="gp-wallet-setup-note">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400/90" strokeWidth={2} />
        <p>{reg.walletSetupHint}</p>
      </div>

      {onWalletLoginInstead && (
        <button
          type="button"
          disabled={busy}
          onClick={onWalletLoginInstead}
          className="w-full text-center text-xs gp-muted py-2 underline-offset-2 hover:underline hover:text-emerald-400/90 disabled:opacity-60"
        >
          {reg.walletLoginInstead}
        </button>
      )}
    </div>
  );
}
