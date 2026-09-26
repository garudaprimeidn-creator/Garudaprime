import React, { useEffect, useMemo, useState } from "react";
import {
  X, Rocket, Loader2, ArrowRightLeft, Wallet, CheckCircle2, Clock, AlertCircle,
} from "lucide-react";
import { useLanguage } from "./LanguageContext";
import { useApp } from "./AppContext";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseAuthUid } from "../lib/firebase/useFirebaseAuthUid";
import { isFirebaseConfigured } from "../lib/firebase/config";
import {
  getMigrationStats,
  submitMigrationRequest,
  subscribeMigrationQueue,
  type MigrationRequestDoc,
  type MigrationStatus,
} from "../lib/firebase/migrationService";
import { isMainnetMigrationOpen } from "../lib/ecosystem/garudaEcosystem";
import { GARUDA_CHAIN } from "../lib/web3/garudaChain";

type Props = { onClose: () => void };

const STATUS_STYLE: Record<MigrationStatus, string> = {
  queued: "gp-badge-read gp-badge-read--amber",
  processing: "gp-badge-read gp-badge-read--cyan",
  completed: "gp-badge-read gp-badge-read--emerald",
  failed: "gp-badge-read gp-badge-read--red",
};

export const MainnetMigrationPanel = ({ onClose }: Props) => {
  const { showToast, walletAddress } = useApp();
  const { connectedWallet } = useAuth();
  const { uid: firebaseUid, ready: authReady } = useFirebaseAuthUid();
  const { t } = useLanguage();
  const mn = t.mainnetMigration;

  const [queue, setQueue] = useState<({ id: string } & MigrationRequestDoc)[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const useRemote = isFirebaseConfigured && authReady && Boolean(firebaseUid);
  const uid = firebaseUid;

  useEffect(() => {
    if (!isMainnetMigrationOpen()) {
      setLoading(false);
      return;
    }
    if (!useRemote) {
      setLoading(false);
      return;
    }
    const unsub = subscribeMigrationQueue(
      (rows) => { setQueue(rows); setLoading(false); },
      () => setLoading(false),
    );
    return unsub;
  }, [useRemote]);

  const stats = useMemo(() => getMigrationStats(queue), [queue]);
  const myRequests = useMemo(
    () => (uid ? queue.filter((r) => r.uid === uid) : []),
    [queue, uid],
  );

  const submit = async () => {
    const addr = connectedWallet?.address ?? walletAddress;
    const amt = amount.trim();
    if (!addr) { showToast(mn.connectWallet, "error"); return; }
    if (!amt || Number(amt) <= 0) { showToast(mn.invalidAmount, "error"); return; }
    if (!uid) { showToast(mn.loginRequired, "warning"); return; }

    setSubmitting(true);
    try {
      if (useRemote) {
        await submitMigrationRequest(uid, addr, amt);
      }
      setAmount("");
      showToast(mn.requestSubmitted, "success");
    } catch {
      showToast(mn.requestFailed, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isMainnetMigrationOpen()) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center">
        <Rocket className="w-10 h-10 text-zinc-500 mb-3" />
        <p className="gp-text font-semibold">{mn.disabledTitle}</p>
        <p className="gp-muted text-xs mt-1">{mn.disabledDesc}</p>
        <button type="button" onClick={onClose} className="mt-4 px-4 py-2 rounded-xl gp-subtle text-xs">{mn.close}</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="gp-panel-header flex items-start gap-3 p-4 pt-6 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/25 flex items-center justify-center gp-read-teal shrink-0">
          <Rocket className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="gp-text font-bold text-base leading-tight">{mn.title}</h3>
          <p className="gp-muted text-xs mt-0.5">{mn.subtitle}</p>
        </div>
        <button type="button" onClick={onClose} className="gp-muted gp-icon-btn p-1 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="gp-panel-body p-4 space-y-4" style={{ scrollbarWidth: "none" }}>
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: <Clock className="w-3.5 h-3.5" />, label: mn.statQueued, value: stats.totalQueued },
            { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: mn.statCompleted, value: stats.totalCompleted },
            { icon: <ArrowRightLeft className="w-3.5 h-3.5" />, label: mn.statVolume, value: `${Math.round(stats.volumeGat).toLocaleString()} GAT` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl gp-subtle border p-2.5 text-center">
              <div className="flex justify-center gp-read-teal mb-1">{s.icon}</div>
              <p className="gp-text text-sm font-bold gp-num">{s.value}</p>
              <p className="gp-muted text-[9px] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-teal-500/20 gp-glass p-4 space-y-2">
          <p className="gp-text text-xs font-semibold">{mn.networkSpec}</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="gp-subtle rounded-xl p-2.5">
              <p className="gp-muted text-[10px]">{mn.chainId}</p>
              <p className="gp-num font-bold mt-0.5">{GARUDA_CHAIN.chainId}</p>
            </div>
            <div className="gp-subtle rounded-xl p-2.5">
              <p className="gp-muted text-[10px]">{mn.networkMode}</p>
              <p className="font-semibold mt-0.5 capitalize">{GARUDA_CHAIN.status}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-teal-500/25 p-4 space-y-3">
          <p className="gp-text text-sm font-semibold flex items-center gap-1.5">
            <Wallet className="w-4 h-4 gp-read-teal" /> {mn.requestTitle}
          </p>
          <p className="gp-muted text-[11px] leading-relaxed">{mn.requestHint}</p>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={mn.amountPlaceholder}
            type="number"
            min="0"
            className="w-full gp-input rounded-xl px-3 py-2 text-xs"
          />
          <button
            type="button"
            disabled={submitting || !amount.trim()}
            onClick={submit}
            className="w-full py-2.5 rounded-xl bg-teal-500 text-black text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
            {mn.submitRequest}
          </button>
        </div>

        <div>
          <p className="gp-text text-sm font-semibold mb-2">{mn.myRequests}</p>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
            </div>
          ) : myRequests.length === 0 ? (
            <p className="gp-muted text-xs">{mn.noRequests}</p>
          ) : (
            <div className="space-y-2">
              {myRequests.map((r) => (
                <div key={r.id} className="rounded-xl border border-teal-500/15 gp-glass p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="gp-text text-xs font-semibold gp-num">{r.amountGat} GAT</p>
                    <p className="gp-muted text-[10px] truncate">{r.walletAddress.slice(0, 8)}…{r.walletAddress.slice(-6)}</p>
                  </div>
                  <span className={`${STATUS_STYLE[r.status]} shrink-0`}>
                    {mn.status[r.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 flex gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="gp-muted text-[11px] leading-relaxed">{mn.syariahNote}</p>
        </div>

        <div className="gp-muted text-[10px] space-y-1">
          {mn.steps.map((step, i) => (
            <p key={step}><span className="gp-read-teal font-semibold">{i + 1}.</span> {step}</p>
          ))}
        </div>
      </div>
    </div>
  );
};
