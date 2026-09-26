import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, ChevronRight, Shield, Loader2, PenLine, CheckCircle2, Wallet, Check, Star, Zap, Unlock,
} from "lucide-react";
import { useLanguage } from "../../app/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  type ConnectOption,
  type WalletAuthStep,
  type ConnectedWallet,
  type WalletProvider,
} from "../../lib/web3/walletService";
import { getConnectedWalletDocs, type ConnectedWalletDoc } from "../../lib/firebase/firestoreService";
import {
  dedupeConnectedWalletDocs,
  formatWalletAddressShort,
  mergeConnectedWalletRowsForDisplay,
  resolvePrimaryWalletAddress,
  resolveFirestoreWalletProvider,
  resolveWalletDisplayLabel,
  resolveWalletRowDisplay,
  syncWalletProviderLocksFromFirestore,
} from "../../lib/web3/connectedWalletUtils";
import { showAppToast } from "../../app/appToast";
import { resolveFirebaseAuthToast } from "../../lib/firebase/authErrors";
import { preloadWalletConnect } from "../../lib/web3/walletConnectProvider";
import { attachMobileWalletFlow } from "../../lib/web3/mobileWalletFlow";
import { isMobileDevice } from "../../lib/web3/trustWalletProvider";
import {
  isEmbeddedWalletEnabled,
  isEmbeddedWalletDemoMode,
  embeddedWalletProviderLabel,
} from "../../lib/web3/embeddedWalletConfig";
import { GarudaPrimeWalletButton } from "./GarudaPrimeWalletButton";
import { collectGarudaWalletAddresses } from "../../lib/web3/garudaNativeProvision";
import { isGarudaSignWindowActive } from "../../lib/web3/garudaWalletSignGate";
import { GarudaWalletPinUnlock } from "../wallet/GarudaWalletPinUnlock";

const RecoveryFlow = React.lazy(() =>
  import("../wallet/GarudaWalletRecoveryFlow").then((m) => ({ default: m.GarudaWalletRecoveryFlow })),
);

const PROVIDER_STYLES: Record<
  Exclude<ConnectOption, "kycport">,
  { emoji: string; accent: string; ring: string }
> = {
  metamask: { emoji: "🦊", accent: "from-orange-500/15 to-amber-400/10", ring: "border-orange-500/25" },
  walletconnect: { emoji: "🔗", accent: "from-blue-500/15 to-cyan-400/10", ring: "border-blue-500/25" },
  trustwallet: { emoji: "🛡️", accent: "from-sky-500/15 to-blue-400/10", ring: "border-sky-500/25" },
};

type LinkedWalletRow = ConnectedWalletDoc;

type Props = {
  open: boolean;
  onClose: () => void;
  mode?: "login" | "connect";
  onConnected?: (wallet: ConnectedWallet) => void;
  onKycConnect?: () => void;
};

export const WalletConnectModal = ({
  open,
  onClose,
  mode = "login",
  onConnected,
}: Props) => {
  const { t, lang } = useLanguage();
  const auth = t.auth;
  const toast = t.toast as Record<string, string>;
  const wc = auth.walletconnect as Record<string, string>;
  const pd = t.profileDetails;
  const {
    signInWithWallet,
    linkWeb3Wallet,
    setPrimaryWeb3Wallet,
    refreshUserProfile,
    walletAuthStep,
    loading,
    user,
    userProfile,
    connectedWallet,
  } = useAuth();
  const [connectBusy, setConnectBusy] = React.useState(false);
  const [primaryBusy, setPrimaryBusy] = React.useState(false);
  const [walletRows, setWalletRows] = React.useState<LinkedWalletRow[]>([]);
  const [walletsLoading, setWalletsLoading] = React.useState(false);
  const [selectedAddress, setSelectedAddress] = React.useState<string | null>(null);
  const [primaryOverride, setPrimaryOverride] = React.useState<string | null>(null);
  const [garudaAddresses, setGarudaAddresses] = React.useState<string[]>([]);
  const [garudaSignActive, setGarudaSignActive] = React.useState(isGarudaSignWindowActive());
  const [garudaPinUnlockOpen, setGarudaPinUnlockOpen] = React.useState(false);
  const [garudaPhraseUnlockOpen, setGarudaPhraseUnlockOpen] = React.useState(false);

  const primaryAddress = resolvePrimaryWalletAddress(
    primaryOverride ?? userProfile?.walletAddress,
    connectedWallet?.address,
  );

  const displayWalletRows = React.useMemo(() => {
    try {
      const extraWallets: { address: string; walletType: string; id: string }[] = [];
      garudaAddresses.forEach((address, idx) => {
        if (!address?.startsWith("0x")) return;
        extraWallets.push({
          address,
          walletType: "embedded:garuda",
          id: idx === 0 ? "garuda_server" : `garuda_extra_${idx}`,
        });
      });
      if (
        connectedWallet?.address?.startsWith("0x")
        && connectedWallet.provider === "embedded:garuda"
        && !garudaAddresses.some((a) => a.toLowerCase() === connectedWallet.address.toLowerCase())
      ) {
        extraWallets.push({
          address: connectedWallet.address,
          walletType: "embedded:garuda",
          id: "garuda_session",
        });
      }
      return mergeConnectedWalletRowsForDisplay(walletRows, {
        uid: user?.uid,
        profileAddress: userProfile?.walletAddress,
        extraWallets,
      }).filter((row) => /^0x/i.test(row.walletAddress?.trim() ?? ""));
    } catch (err) {
      console.warn("[WalletConnectModal] merge rows failed", err);
      return [];
    }
  }, [walletRows, user?.uid, userProfile?.walletAddress, garudaAddresses, connectedWallet]);

  const loadLinkedWallets = React.useCallback(async () => {
    if (!user?.uid) {
      setWalletRows([]);
      return;
    }
    setWalletsLoading(true);
    try {
      const [rows, garudaAddrs] = await Promise.all([
        getConnectedWalletDocs(user.uid),
        collectGarudaWalletAddresses(user.uid),
      ]);
      const deduped = dedupeConnectedWalletDocs(rows);
      syncWalletProviderLocksFromFirestore(deduped);
      setWalletRows(deduped);
      setGarudaAddresses(garudaAddrs);
      const preferred = primaryOverride ?? userProfile?.walletAddress ?? deduped[0]?.walletAddress ?? garudaAddrs[0] ?? null;
      setSelectedAddress(preferred);
    } catch (err) {
      console.warn("[WalletConnectModal] load wallets failed", err);
      setWalletRows([]);
      setSelectedAddress(null);
    } finally {
      setWalletsLoading(false);
    }
  }, [user?.uid, userProfile?.walletAddress, primaryOverride]);

  React.useEffect(() => {
    if (open) preloadWalletConnect();
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      setPrimaryOverride(null);
      setGarudaAddresses([]);
      setGarudaPinUnlockOpen(false);
      setGarudaPhraseUnlockOpen(false);
      return;
    }
    if (user?.uid) void loadLinkedWallets();
  }, [open, user?.uid, loadLinkedWallets]);

  React.useEffect(() => {
    if (!open) return;
    const tick = () => setGarudaSignActive(isGarudaSignWindowActive());
    tick();
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
  }, [open, garudaPinUnlockOpen, garudaPhraseUnlockOpen]);

  React.useEffect(() => {
    if (!userProfile?.walletAddress || primaryBusy) return;
    setPrimaryOverride(userProfile.walletAddress);
  }, [userProfile?.walletAddress, primaryBusy]);

  React.useEffect(() => {
    const step = mode === "login" && loading
      ? walletAuthStep === "connecting"
        ? "connect"
        : walletAuthStep === "signing"
          ? "sign"
          : "idle"
      : mode === "connect" && connectBusy
        ? "connect"
        : "idle";
    return attachMobileWalletFlow({
      active: step !== "idle",
      step,
      provider: "walletconnect",
      onResume: () => {
        if (isMobileDevice() && (step === "connect" || step === "sign")) {
          showAppToast(wc.mobileResume ?? auth.walletFlowHint, "info");
        }
      },
    });
  }, [mode, loading, walletAuthStep, connectBusy, wc.mobileResume, auth.walletFlowHint]);

  const showEmbeddedDemo = isEmbeddedWalletDemoMode();
  const showEmbeddedGaruda = isEmbeddedWalletEnabled() && !isEmbeddedWalletDemoMode();
  const showEmbedded = showEmbeddedDemo || showEmbeddedGaruda;

  const options: { provider: ConnectOption; name: string; sub: string }[] = [
    { provider: "metamask", name: auth.wallets[0]?.name ?? "MetaMask", sub: auth.wallets[0]?.sub ?? "" },
    { provider: "walletconnect", name: auth.wallets[1]?.name ?? "WalletConnect", sub: auth.wallets[1]?.sub ?? "" },
    { provider: "trustwallet", name: auth.wallets[2]?.name ?? "Trust Wallet", sub: auth.wallets[2]?.sub ?? "" },
  ];

  const STEP_KEY: Partial<Record<WalletAuthStep, keyof typeof auth.walletSteps>> = {
    connecting: "connect",
    signing: "sign",
    verifying: "verify",
    linking: "link",
    success: "success",
  };

  const stepLabel = () => {
    const key = STEP_KEY[walletAuthStep];
    if (key) return auth.walletSteps[key];
    return auth.walletconnect.subtitle;
  };

  const handleConnect = async (provider: ConnectOption) => {
    try {
      if (mode === "connect") {
        setConnectBusy(true);
        const hadWallets = walletRows.length > 0;
        const wallet = await linkWeb3Wallet(provider as WalletProvider, {
          makePrimary: !hadWallets,
          forceNewSession: hadWallets,
        });
        await refreshUserProfile();
        await loadLinkedWallets();
        if (!hadWallets) {
          setPrimaryOverride(wallet.address);
        }
        showAppToast(
          hadWallets ? (wc.walletLinked ?? auth.walletConnected) : (wc.primarySet ?? auth.walletConnected),
          "success",
        );
        onConnected?.(wallet);
        onClose();
        return;
      }
      await signInWithWallet(provider as WalletProvider);
      onClose();
    } catch (e) {
      showAppToast(resolveFirebaseAuthToast(e, toast), "error");
    } finally {
      setConnectBusy(false);
    }
  };

  const handleSetPrimary = async () => {
    if (!selectedAddress) return;
    const normalizedSelected = selectedAddress.toLowerCase();
    if (normalizedSelected === primaryAddress) {
      onClose();
      return;
    }
    const selectedRow = displayWalletRows.find(
      (row) => row.walletAddress.toLowerCase() === normalizedSelected,
    );
    const firestoreRow = walletRows.find(
      (row) => row.walletAddress.toLowerCase() === normalizedSelected,
    );
    const row = firestoreRow ?? selectedRow;
    setPrimaryBusy(true);
    try {
      const docId = firestoreRow?.id;
      const wallet = await setPrimaryWeb3Wallet(selectedAddress, {
        walletType: row?.walletType ?? (
          selectedRow && resolveFirestoreWalletProvider(selectedRow) === "embedded:garuda"
            ? "embedded:garuda"
            : undefined
        ),
        network: row?.network,
        docId: docId && !["profile_wallet", "local_wallet", "garuda_server", "garuda_session"].includes(docId)
          && !docId.startsWith("garuda_extra_")
          ? docId
          : undefined,
      });
      setPrimaryOverride(wallet.address);
      await refreshUserProfile();
      await loadLinkedWallets();
      showAppToast(wc.primarySet ?? auth.walletConnected, "success");
      onConnected?.(wallet);
      onClose();
    } catch (e) {
      showAppToast(resolveFirebaseAuthToast(e, toast), "error");
    } finally {
      setPrimaryBusy(false);
    }
  };

  const linkFlowActive = mode === "connect" && walletAuthStep !== "idle";
  const busy = mode === "login"
    ? loading || walletAuthStep !== "idle"
    : connectBusy || primaryBusy || linkFlowActive;

  const showManageWallets = mode === "connect";
  const garudaInLinkedList = displayWalletRows.some(
    (row) => resolveFirestoreWalletProvider(row) === "embedded:garuda",
  );
  const hasGarudaWallet = garudaInLinkedList || garudaAddresses.length > 0;
  const selectedGarudaAddress = selectedAddress && displayWalletRows.some(
    (row) => row.walletAddress.toLowerCase() === selectedAddress.toLowerCase()
      && resolveFirestoreWalletProvider(row) === "embedded:garuda",
  ) ? selectedAddress : null;
  /** Tampilkan MetaMask/Trust/WC saat hubung dompet tambahan, jangan paksa Garuda Premium saja. */
  const connectGarudaOnly = false;
  const selectedIsPrimary = Boolean(
    selectedAddress && selectedAddress.toLowerCase() === primaryAddress,
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 gp-overlay-backdrop gp-overlay-backdrop--sheet"
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-md gp-modal-sheet gp-reg-wallet-sheet-modal rounded-3xl border shadow-2xl overflow-hidden max-h-[min(90vh,720px)] flex flex-col"
          >
            <div className="gp-reg-wallet-sheet flex flex-col min-h-0 flex-1">
              <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 shrink-0">
                <div className="min-w-0 pr-2">
                  <p className="gp-reg-wallet-sheet__kicker text-[10px] font-semibold uppercase tracking-[0.14em] mb-1.5">
                    {auth.walletconnect.title}
                  </p>
                  <h3 className="gp-text text-lg font-bold tracking-tight leading-snug">
                    {connectGarudaOnly && walletAuthStep === "idle"
                      ? (wc.connectGarudaTitle ?? wc.embeddedTitle ?? "Garuda Premium")
                      : showManageWallets && walletAuthStep === "idle"
                        ? (displayWalletRows.length > 0
                          ? (wc.connectNew ?? "Hubungkan dompet baru")
                          : (wc.selectPrimary ?? auth.walletconnect.subtitle))
                        : stepLabel()}
                  </h3>
                </div>
                <button type="button" onClick={onClose} className="gp-icon-btn gp-icon-btn--compact shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {busy && walletAuthStep !== "idle" ? (
                <div className="px-5 pb-6 pt-2 flex flex-col items-center text-center gap-4 overflow-y-auto">
                  <div className="w-16 h-16 rounded-2xl gp-auth-luxe-icon gp-auth-luxe-icon--emerald flex items-center justify-center">
                    {walletAuthStep === "success"
                      ? <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                      : walletAuthStep === "signing"
                        ? <PenLine className="w-7 h-7 text-emerald-400 animate-pulse" />
                        : <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />}
                  </div>
                  <div className="space-y-1">
                    <p className="gp-text text-sm font-semibold">{stepLabel()}</p>
                    <p className="gp-muted text-xs leading-relaxed max-w-[260px]">
                      {walletAuthStep === "connecting" && isMobileDevice()
                        ? wc.mobileHint
                        : auth.walletFlowHint}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-y-auto min-h-0 flex-1 px-4 pb-4 space-y-4">
                  {!connectGarudaOnly && (
                    <div className="gp-reg-wallet-sheet__network">
                      <span className="gp-reg-wallet-sheet__network-icon">
                        <Zap className="w-3.5 h-3.5" strokeWidth={2.5} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="gp-text text-[11px] font-bold">Sidra Network</p>
                        <p className="gp-muted text-[10px] leading-relaxed mt-0.5">
                          {wc.sidraNetworkHint}
                        </p>
                      </div>
                    </div>
                  )}
                  {connectGarudaOnly && walletAuthStep === "idle" && (
                    <p className="gp-muted text-[11px] leading-relaxed px-1">
                      {wc.connectGarudaSubtitle ?? wc.garudaWalletRecommended}
                    </p>
                  )}
                  {showManageWallets && (
                    <div className="space-y-2.5">
                      <p className="gp-reg-wallet-sheet__section-label px-1">
                        {wc.linkedWallets ?? "Dompet terhubung"}
                      </p>
                      {walletsLoading ? (
                        <div className="flex justify-center py-6">
                          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                        </div>
                      ) : displayWalletRows.length ? (
                        displayWalletRows.map((row) => {
                          const rowKey = row.walletAddress.toLowerCase();
                          const isPrimary = rowKey === primaryAddress;
                          const isSelected = rowKey === selectedAddress?.toLowerCase();
                          const display = resolveWalletRowDisplay(row, lang === "id" ? "id" : "en", connectedWallet);
                          const providerLabel = resolveWalletDisplayLabel(row, connectedWallet);
                          const effective = resolveFirestoreWalletProvider(row);
                          const isGaruda = effective === "embedded:garuda";
                          const garudaLocked = isGaruda && !garudaSignActive;
                          return (
                            <button
                              key={`${rowKey}-${row.id}`}
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setSelectedAddress(row.walletAddress);
                                setGarudaPinUnlockOpen(false);
                                setGarudaPhraseUnlockOpen(false);
                              }}
                              className={`gp-reg-wallet-linked disabled:opacity-60 ${
                                isSelected ? "gp-reg-wallet-linked--active" : ""
                              }`}
                            >
                              <span className="gp-reg-wallet-linked__icon">
                                {isSelected
                                  ? <Check className="w-4 h-4" strokeWidth={2.5} />
                                  : garudaLocked
                                    ? <Shield className="w-4 h-4 text-amber-400" strokeWidth={2.5} />
                                    : <Wallet className="w-4 h-4" strokeWidth={2} />}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="gp-reg-wallet-linked__name">{display.kindLabel}</p>
                                  {display.badge && (
                                    <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                                      isGaruda
                                        ? "bg-emerald-500/15 text-emerald-600"
                                        : "bg-slate-500/10 text-slate-600"
                                    }`}>
                                      {display.badge}
                                    </span>
                                  )}
                                  {garudaLocked && (
                                    <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500">
                                      {wc.garudaLockedBadge ?? "Perlu PIN"}
                                    </span>
                                  )}
                                  {isGaruda && garudaSignActive && isSelected && (
                                    <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                                      {wc.garudaSignReady ?? "Siap menandatangani"}
                                    </span>
                                  )}
                                  {isPrimary && (
                                    <span className="inline-flex items-center gap-0.5 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                                      <Star className="w-2.5 h-2.5 fill-current" />
                                      {wc.primaryBadge ?? "Utama"}
                                    </span>
                                  )}
                                </div>
                                <p className="gp-reg-wallet-linked__address">
                                  {formatWalletAddressShort(row.walletAddress)}
                                </p>
                                <p className="gp-reg-wallet-linked__provider truncate">
                                  {providerLabel} · {row.network}
                                </p>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <p className="gp-muted text-xs text-center py-4 px-2">{wc.noLinkedWallets ?? "Belum ada dompet terhubung."}</p>
                      )}

                      {displayWalletRows.length > 0 && selectedAddress && (
                        <button
                          type="button"
                          disabled={busy || selectedIsPrimary}
                          onClick={() => void handleSetPrimary()}
                          className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                        >
                          {primaryBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
                          {selectedIsPrimary
                            ? (wc.alreadyPrimary ?? "Dompet utama aktif")
                            : (wc.setPrimary ?? "Gunakan sebagai Dompet Utama")}
                        </button>
                      )}

                      {selectedGarudaAddress && !garudaSignActive && !garudaPinUnlockOpen && !garudaPhraseUnlockOpen && (
                        <div className="space-y-2">
                          <p className="gp-reg-wallet-sheet__hint px-1">
                            {wc.garudaSignHint ?? pd.walletRecoveryVerifyPinHint}
                          </p>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setGarudaPinUnlockOpen(true)}
                            className="w-full py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold text-sm flex items-center justify-center gap-2 gp-hover-row"
                          >
                            <Unlock className="w-4 h-4" />
                            {pd.walletRecoveryVerifyPin ?? "Verifikasi PIN"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setGarudaPhraseUnlockOpen(true)}
                            className="w-full text-center text-[10px] gp-muted underline underline-offset-2 hover:text-emerald-400/90"
                          >
                            {wc.garudaPhraseUnlockLink ?? pd.walletRecoveryPhraseUnlockLink}
                          </button>
                        </div>
                      )}

                      {selectedGarudaAddress && garudaPinUnlockOpen && (
                        <GarudaWalletPinUnlock
                          title={pd.walletRecoveryVerifyPin ?? "Verifikasi PIN"}
                          hint={pd.walletRecoveryVerifyPinHint ?? wc.garudaSignHint ?? ""}
                          pinLabel={pd.walletRecoveryPasswordLabel ?? "PIN Aplikasi"}
                          pinPlaceholder={pd.walletRecoveryPasswordPlaceholder ?? "Masukkan PIN"}
                          submitLabel={pd.walletRecoveryVerifyPinBtn ?? "Verifikasi PIN"}
                          pinRequiredTitle={pd.walletRecoveryPinRequired ?? "PIN belum diatur"}
                          pinRequiredBody={pd.walletRecoveryPinRequiredBody ?? ""}
                          invalidPin={pd.walletRecoveryInvalidPin ?? "PIN salah"}
                          onSuccess={() => {
                            setGarudaSignActive(true);
                            setGarudaPinUnlockOpen(false);
                            showAppToast(pd.walletRecoveryUnlockSuccess ?? "Dompet Garuda Prime terbuka", "success");
                          }}
                        />
                      )}

                      {selectedGarudaAddress && garudaPhraseUnlockOpen && user?.uid && (
                        <div className="gp-recovery-flow--compact rounded-2xl border gp-divider p-3 bg-black/10 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="gp-muted text-[10px] leading-relaxed">
                              {pd.walletRecoveryUnlockHint}
                            </p>
                            <button
                              type="button"
                              onClick={() => setGarudaPhraseUnlockOpen(false)}
                              className="shrink-0 text-[10px] text-emerald-400 font-semibold"
                            >
                              {wc.garudaBackToPin ?? "← PIN"}
                            </button>
                          </div>
                          <React.Suspense
                            fallback={(
                              <div className="flex justify-center py-8">
                                <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                              </div>
                            )}
                          >
                            <RecoveryFlow
                              mode="unlock"
                              uid={user.uid}
                              garudaAddress={selectedGarudaAddress}
                              hideStepHeader
                              hideAddress
                              labels={{
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
                              }}
                              showToast={showAppToast}
                              onUnlockSuccess={() => {
                                setGarudaSignActive(true);
                                setGarudaPhraseUnlockOpen(false);
                                showAppToast(pd.walletRecoveryUnlockSuccess ?? "Dompet Garuda Prime terbuka", "success");
                              }}
                            />
                          </React.Suspense>
                        </div>
                      )}

                      {selectedGarudaAddress && garudaSignActive && (
                        <p className="gp-reg-wallet-sheet__hint px-1 text-emerald-400/90">
                          {pd.walletRecoverySignReady ?? wc.garudaSignReady ?? "Siap menandatangani transaksi"}
                        </p>
                      )}

                      {displayWalletRows.length > 0 && (
                        <p className="gp-reg-wallet-sheet__hint px-1">
                          {wc.linkHint ?? "Hubungkan dompet baru dari provider di bawah. Dompet utama hanya berubah saat Anda menekan tombol di atas."}
                        </p>
                      )}

                      <div className="gp-reg-wallet-sheet__divider">
                        <span>{wc.connectNew ?? "Hubungkan dompet baru"}</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {(showEmbeddedGaruda || (connectGarudaOnly && showEmbedded)) && !hasGarudaWallet && (
                      <GarudaPrimeWalletButton
                        disabled={busy}
                        title={wc.embeddedTitle ?? embeddedWalletProviderLabel()}
                        subtitle={wc.garudaWalletRecommended ?? wc.embeddedSub ?? "Tanpa seed phrase, dompet Garuda"}
                        onSuccess={async (wallet) => {
                          try {
                            await refreshUserProfile();
                            await loadLinkedWallets();
                            showAppToast(wc.embeddedLinked ?? auth.walletConnected, "success");
                            onConnected?.(wallet);
                            onClose();
                          } catch (e) {
                            showAppToast(resolveFirebaseAuthToast(e, toast), "error");
                          }
                        }}
                        onError={(e) => showAppToast(resolveFirebaseAuthToast(e, toast), "error")}
                      />
                    )}
                    {showEmbeddedGaruda && hasGarudaWallet && !garudaInLinkedList && garudaAddresses[0] && (
                      <GarudaPrimeWalletButton
                        disabled={busy}
                        linkedAddress={garudaAddresses[0]}
                        title={wc.embeddedTitle ?? embeddedWalletProviderLabel()}
                        subtitle={wc.garudaWalletRecommended ?? "Dompet resmi Garuda Prime"}
                        primaryAddress={primaryAddress}
                        onSetPrimary={async (address) => {
                          setPrimaryBusy(true);
                          try {
                            const wallet = await setPrimaryWeb3Wallet(address, { walletType: "embedded:garuda" });
                            setPrimaryOverride(wallet.address);
                            await refreshUserProfile();
                            await loadLinkedWallets();
                            showAppToast(wc.primarySet ?? auth.walletConnected, "success");
                            onConnected?.(wallet);
                            onClose();
                          } catch (e) {
                            showAppToast(resolveFirebaseAuthToast(e, toast), "error");
                          } finally {
                            setPrimaryBusy(false);
                          }
                        }}
                        onSuccess={async (wallet) => {
                          try {
                            await refreshUserProfile();
                            await loadLinkedWallets();
                            showAppToast(wc.embeddedLinked ?? auth.walletConnected, "success");
                            onConnected?.(wallet);
                            if (mode === "login") onClose();
                          } catch (e) {
                            showAppToast(resolveFirebaseAuthToast(e, toast), "error");
                          }
                        }}
                        onError={(e) => showAppToast(resolveFirebaseAuthToast(e, toast), "error")}
                      />
                    )}
                    {!connectGarudaOnly && showEmbeddedDemo && !hasGarudaWallet && (
                      <GarudaPrimeWalletButton
                        disabled={busy}
                        title={wc.embeddedTitle ?? embeddedWalletProviderLabel()}
                        subtitle={`${wc.embeddedSub ?? "Tanpa seed phrase"} · demo`}
                        onSuccess={async (wallet) => {
                          await refreshUserProfile();
                          await loadLinkedWallets();
                          showAppToast(wc.embeddedLinked ?? auth.walletConnected, "success");
                          onConnected?.(wallet);
                          onClose();
                        }}
                        onError={(e) => showAppToast(resolveFirebaseAuthToast(e, toast), "error")}
                      />
                    )}
                    {!connectGarudaOnly && options.map((w) => {
                      const style = PROVIDER_STYLES[w.provider];
                      return (
                        <motion.button
                          key={w.provider}
                          type="button"
                          disabled={busy}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => void handleConnect(w.provider)}
                          className="gp-reg-wallet-provider w-full flex items-center gap-3.5 p-3.5 rounded-2xl text-left disabled:opacity-55"
                        >
                          <span className={`gp-reg-wallet-provider__icon bg-gradient-to-br ${style.accent} ${style.ring}`}>
                            <span className="text-xl leading-none" aria-hidden>{style.emoji}</span>
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="gp-text text-sm font-bold">{w.name}</p>
                            <p className="gp-muted text-[10px] mt-0.5">{w.sub}</p>
                          </div>
                          <span className="gp-reg-wallet-provider__chevron shrink-0">
                            {busy ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                            )}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                  <div className="gp-reg-wallet-sheet__security">
                    <Shield className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" strokeWidth={2} />
                    <div className="min-w-0">
                      <p className="gp-text text-[11px] font-bold flex items-center gap-1.5">
                        <Wallet className="w-3 h-3 opacity-70" />
                        {auth.walletSecurityTitle}
                      </p>
                      <p className="gp-muted text-[10px] leading-relaxed mt-1">{auth.walletSecurity}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
