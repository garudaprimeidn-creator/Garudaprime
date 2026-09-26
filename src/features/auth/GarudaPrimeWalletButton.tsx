import React from "react";
import { motion } from "motion/react";
import { ChevronRight, CheckCircle2, Loader2, Shield, Star, Unlock } from "lucide-react";
import { APP_ORIGIN } from "../../lib/app/branding";
import { embeddedWalletProviderLabel } from "../../lib/web3/embeddedWalletConfig";
import { fetchGarudaWalletSecurity } from "../../lib/web3/garudaWalletSecurityApi";
import { formatAddress, type ConnectedWallet } from "../../lib/web3/walletService";
import { useAuth } from "../../contexts/AuthContext";
import { GarudaWalletOtpModal } from "./GarudaWalletOtpModal";
import { isGarudaSignWindowActive } from "../../lib/web3/garudaWalletSignGate";
import { useLanguage } from "../../app/LanguageContext";
import { showAppToast } from "../../app/appToast";
import { GarudaWalletPinUnlock } from "../wallet/GarudaWalletPinUnlock";

type Props = {
  disabled?: boolean;
  title: string;
  subtitle: string;
  linkedAddress?: string | null;
  primaryAddress?: string | null;
  onSetPrimary?: (address: string) => void | Promise<void>;
  onSuccess: (wallet: ConnectedWallet) => void;
  onError: (err: unknown) => void;
};

/** Garuda Prime native wallet, OTP email wajib untuk pembuatan dompet baru. */
export function GarudaPrimeWalletButton({
  disabled,
  title,
  subtitle,
  linkedAddress,
  primaryAddress,
  onSetPrimary,
  onSuccess,
  onError,
}: Props) {
  const { t } = useLanguage();
  const pd = t.profileDetails;
  const authWc = t.auth.walletconnect as Record<string, string>;
  const { user, linkEmbeddedGarudaWallet } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [otpOpen, setOtpOpen] = React.useState(false);
  const [pinUnlockOpen, setPinUnlockOpen] = React.useState(false);
  const [signActive, setSignActive] = React.useState(isGarudaSignWindowActive());
  const [resolvedAddress, setResolvedAddress] = React.useState<string | null>(
    linkedAddress?.startsWith("0x") ? linkedAddress : null,
  );

  React.useEffect(() => {
    if (linkedAddress?.startsWith("0x")) {
      setResolvedAddress(linkedAddress);
      return;
    }
    let cancelled = false;
    void fetchGarudaWalletSecurity().then((summary) => {
      if (cancelled) return;
      if (summary?.hasWallet && summary.address?.startsWith("0x")) {
        setResolvedAddress(summary.address);
      } else {
        setResolvedAddress(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [linkedAddress]);

  React.useEffect(() => {
    if (!resolvedAddress) return;
    const tick = () => setSignActive(isGarudaSignWindowActive());
    tick();
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
  }, [resolvedAddress, pinUnlockOpen]);

  const handleCreateClick = async () => {
    setBusy(true);
    try {
      const summary = await fetchGarudaWalletSecurity().catch(() => null);
      if (summary?.hasWallet) {
        if (isGarudaSignWindowActive()) {
          const wallet = await linkEmbeddedGarudaWallet();
          onSuccess(wallet);
          return;
        }
        setPinUnlockOpen(true);
        return;
      }
      setOtpOpen(true);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const handlePinUnlockSuccess = async () => {
    try {
      const wallet = await linkEmbeddedGarudaWallet();
      setSignActive(true);
      setPinUnlockOpen(false);
      onSuccess(wallet);
    } catch (e) {
      onError(e);
    }
  };

  const isPrimary = Boolean(
    resolvedAddress
    && primaryAddress
    && resolvedAddress.toLowerCase() === primaryAddress.toLowerCase(),
  );

  if (resolvedAddress) {
    return (
      <div className="space-y-3">
        <div className={`gp-reg-wallet-linked w-full${signActive ? " gp-reg-wallet-linked--active" : ""}`}>
          <span className="gp-reg-wallet-linked__icon">
            {signActive
              ? <CheckCircle2 className="w-4 h-4 text-emerald-500" strokeWidth={2.5} />
              : <Shield className="w-4 h-4 text-amber-400" strokeWidth={2.5} />}
          </span>
          <div className="flex-1 min-w-0">
            <p className="gp-reg-wallet-linked__name">{title || embeddedWalletProviderLabel()}</p>
            <p className="gp-reg-wallet-linked__address">{formatAddress(resolvedAddress)}</p>
            <p className="gp-reg-wallet-linked__provider truncate">
              {signActive
                ? (pd.walletRecoverySignReady ?? pd.walletRecoveryWalletOpen ?? subtitle)
                : (authWc.garudaSignHint ?? subtitle)}
            </p>
          </div>
        </div>

        {onSetPrimary && !isPrimary && (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void onSetPrimary(resolvedAddress)}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
            {authWc.setPrimary ?? "Gunakan sebagai Dompet Utama"}
          </button>
        )}

        {!signActive && !pinUnlockOpen && !onSetPrimary && (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => setPinUnlockOpen(true)}
            className="w-full py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold text-sm flex items-center justify-center gap-2 gp-hover-row"
          >
            <Unlock className="w-4 h-4" />
            {pd.walletRecoveryVerifyPin ?? "Verifikasi PIN"}
          </button>
        )}

        {pinUnlockOpen && (
          <GarudaWalletPinUnlock
            title={pd.walletRecoveryVerifyPin ?? "Verifikasi PIN"}
            hint={pd.walletRecoveryVerifyPinHint ?? authWc.garudaSignHint ?? ""}
            pinLabel={pd.walletRecoveryPasswordLabel ?? "PIN Aplikasi"}
            pinPlaceholder={pd.walletRecoveryPasswordPlaceholder ?? "Masukkan PIN"}
            submitLabel={pd.walletRecoveryVerifyPinBtn ?? "Verifikasi PIN"}
            pinRequiredTitle={pd.walletRecoveryPinRequired ?? "PIN belum diatur"}
            pinRequiredBody={pd.walletRecoveryPinRequiredBody ?? ""}
            invalidPin={pd.walletRecoveryInvalidPin ?? "PIN salah"}
            onSuccess={() => void handlePinUnlockSuccess()}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <motion.button
        type="button"
        disabled={disabled || busy}
        whileTap={{ scale: 0.98 }}
        onClick={() => void handleCreateClick()}
        className="gp-reg-wallet-provider w-full flex items-center gap-3.5 p-3.5 rounded-2xl text-left disabled:opacity-55 border border-emerald-500/30"
      >
        <span className="gp-reg-wallet-provider__icon w-11 h-11 flex items-center justify-center rounded-xl bg-[#0a0f0d] border border-emerald-500/25 shrink-0 overflow-hidden">
          {busy ? (
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          ) : (
            <img src={`${APP_ORIGIN}/favicon.png`} alt="" width={32} height={32} className="object-contain" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="gp-text text-sm font-bold">{title || embeddedWalletProviderLabel()}</p>
          <p className="gp-muted text-[10px] mt-0.5">{subtitle}</p>
        </div>
        <span className="gp-reg-wallet-provider__chevron shrink-0">
          <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
        </span>
      </motion.button>

      <GarudaWalletOtpModal
        open={otpOpen}
        onClose={() => setOtpOpen(false)}
        onSuccess={onSuccess}
        onError={onError}
      />
    </>
  );
}
