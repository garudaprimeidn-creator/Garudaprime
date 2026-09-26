import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Copy, Loader2, Share2, Star, Wallet, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../app/LanguageContext";
import { showAppToast } from "../../app/appToast";
import { getConnectedWalletDocs, type ConnectedWalletDoc } from "../../lib/firebase/firestoreService";
import { GarudaProcessOverlay } from "./GarudaProcessOverlay";
import {
  dedupeConnectedWalletDocs,
  formatWalletAddressShort,
  mergeConnectedWalletRowsForDisplay,
  normalizeWalletAddress,
  resolveDisplayWalletAddress,
  resolvePrimaryWalletAddress,
  resolvePrimaryWalletRowDisplay,
  resolveWalletRowDisplay,
  syncWalletProviderLocksFromFirestore,
} from "../../lib/web3/connectedWalletUtils";

type Props = {
  address: string;
  onCopy: () => void;
  onShare: () => void;
  onSwitched?: () => void;
};

export function WalletSwitcher({ address, onCopy, onShare, onSwitched }: Props) {
  const { t, lang } = useLanguage();
  const w = t.wallet;
  const tp = t.toolsPanel;
  const {
    user,
    userProfile,
    connectedWallet,
    setPrimaryWeb3Wallet,
  } = useAuth();

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ConnectedWalletDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAddress, setBusyAddress] = useState<string | null>(null);

  const uid = user?.uid;

  const loadWallets = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const docs = await getConnectedWalletDocs(uid);
      syncWalletProviderLocksFromFirestore(docs);
      setRows(docs);
    } catch (err) {
      console.warn("[WalletSwitcher] load wallets failed", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    void loadWallets();
  }, [uid, loadWallets, userProfile?.walletAddress]);

  const mergedRows = useMemo(() => {
    try {
      return mergeConnectedWalletRowsForDisplay(rows, {
        uid,
        profileAddress: userProfile?.walletAddress,
      }).filter((row) => row.walletAddress?.trim() && /^0x/i.test(row.walletAddress.trim()));
    } catch (err) {
      console.warn("[WalletSwitcher] merge rows failed", err);
      return [];
    }
  }, [rows, uid, userProfile?.walletAddress]);

  const activeWalletDisplay = useMemo(() => {
    try {
      return resolvePrimaryWalletRowDisplay(rows, userProfile?.walletAddress, lang === "id" ? "id" : "en");
    } catch (err) {
      console.warn("[WalletSwitcher] display resolve failed", err);
      return null;
    }
  }, [rows, userProfile?.walletAddress, lang]);


  const primaryAddress = resolvePrimaryWalletAddress(userProfile?.walletAddress, address);
  const displayAddress = resolveDisplayWalletAddress(userProfile?.walletAddress, connectedWallet)
    || (address
      ? (() => {
          try {
            return normalizeWalletAddress(address);
          } catch {
            return address;
          }
        })()
      : "");
  const canSwitch = mergedRows.length > 1;

  const handleSelect = async (row: ConnectedWalletDoc) => {
    if (busyAddress || !row.walletAddress?.trim() || !/^0x/i.test(row.walletAddress.trim())) return;
    const rowKey = row.walletAddress.toLowerCase();
    if (rowKey === primaryAddress) {
      setOpen(false);
      return;
    }
    setBusyAddress(rowKey);
    setOpen(false);
    try {
      const firestoreRow = rows.find((r) => r.walletAddress.toLowerCase() === rowKey);
      const docId = firestoreRow?.id ?? row.id;
      await setPrimaryWeb3Wallet(row.walletAddress, {
        walletType: firestoreRow?.walletType ?? row.walletType,
        network: firestoreRow?.network ?? row.network,
        docId: docId && !["profile_wallet", "local_wallet"].includes(docId) ? docId : undefined,
      });
      void loadWallets();
      onSwitched?.();
      showAppToast(tp.primaryWalletUpdated ?? "Dompet utama diperbarui", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : (w.switchWalletFailed ?? "Gagal mengganti dompet");
      showAppToast(msg, "error");
    } finally {
      setBusyAddress(null);
    }
  };

  return (
    <>
      <GarudaProcessOverlay
        active={Boolean(busyAddress)}
        message={w.activatingWallet ?? "Mengaktifkan dompet…"}
        submessage={w.activatingWalletHint ?? "Menyimpan pilihan dompet utama"}
      />
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-600/15 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.12)]">
          <Wallet className="w-5 h-5 gp-wallet-brand-icon" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            disabled={!canSwitch}
            onClick={() => canSwitch && setOpen(true)}
            className={`flex items-center gap-1 max-w-full ${canSwitch ? "gp-hover-row rounded-lg -ml-1 pl-1 pr-0.5" : ""}`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="gp-text text-sm font-semibold truncate">{w.primaryWallet}</p>
              {activeWalletDisplay && (
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${
                  activeWalletDisplay.kindLabel === "MetaMask"
                    ? "bg-orange-500/15 text-orange-400"
                    : activeWalletDisplay.kindLabel === "Garuda Prime"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-sky-500/15 text-sky-400"
                }`}>
                  {activeWalletDisplay.kindLabel}
                </span>
              )}
            </div>
            {canSwitch && (
              <ChevronDown className="w-4 h-4 shrink-0 gp-muted" strokeWidth={2} />
            )}
          </button>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={onCopy}
              className="gp-wallet-link-btn flex items-center gap-1.5 text-xs gp-num gp-hover-row transition-colors truncate rounded-lg px-1 py-0.5"
            >
              {displayAddress ? `${displayAddress.slice(0, 6)}…${displayAddress.slice(-4)}` : ", "}
              <Copy className="w-3.5 h-3.5 shrink-0 gp-wallet-link-icon" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={onShare}
              className="gp-wallet-link-btn gp-icon-btn p-1.5 shrink-0 rounded-lg transition-colors"
              aria-label={t.walletActions.shareAddress}
            >
              <Share2 className="w-3.5 h-3.5 gp-wallet-link-icon" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close"
              className="fixed inset-0 z-[200] bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal
              className="fixed inset-x-0 bottom-0 z-[201] mx-auto max-w-lg rounded-t-2xl border border-emerald-500/20 gp-modal-sheet gp-wallet-switcher-sheet shadow-2xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
            >
              <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b gp-divider">
                <div>
                  <p className="gp-text text-sm font-bold">{w.switchWallet ?? "Ganti Dompet"}</p>
                  <p className="gp-muted text-[10px] mt-0.5">
                    {w.selectPrimaryWallet ?? "Pilih dompet utama untuk transaksi"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-xl gp-glass border gp-wallet-link-btn"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="max-h-[min(60vh,420px)] overflow-y-auto p-3 space-y-2 pb-safe">
                {loading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                  </div>
                ) : mergedRows.map((row) => {
                  const rowKey = row.walletAddress.toLowerCase();
                  const isPrimary = rowKey === primaryAddress;
                  const display = resolveWalletRowDisplay(row, lang === "id" ? "id" : "en");
                  const providerLabel = display.detailLabel;
                  return (
                    <button
                      key={`${rowKey}-${row.id}`}
                      type="button"
                      disabled={Boolean(busyAddress)}
                      onClick={() => void handleSelect(row)}
                      className={`w-full text-left rounded-xl border p-3 transition-colors ${
                        isPrimary
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : "gp-wallet-switcher-row border-transparent hover:border-emerald-500/25"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="gp-text text-sm font-semibold truncate">
                              {display.kindLabel}
                            </p>
                            {display.badge && (
                              <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                                {display.badge}
                              </span>
                            )}
                            {isPrimary && !busyAddress && (
                              <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 flex items-center gap-0.5">
                                <Star className="w-2.5 h-2.5" />
                                {w.walletActive ?? "Aktif"}
                              </span>
                            )}
                          </div>
                          <p className="gp-num gp-text text-xs mt-1 break-all">
                            {formatWalletAddressShort(row.walletAddress)}
                          </p>
                          <p className="gp-muted text-[10px] mt-0.5">{providerLabel}</p>
                        </div>
                        {busyAddress === rowKey && (
                          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
