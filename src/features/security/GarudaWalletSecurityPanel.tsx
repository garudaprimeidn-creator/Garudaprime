import React, { useCallback, useEffect, useState } from "react";
import { Snowflake, RotateCcw, Loader2, Wallet } from "lucide-react";
import { SecurityRow, SecuritySection } from "./GarudaWalletSecurityUi";
import {
  fetchGarudaWalletSecurity,
  freezeGarudaNativeWallet,
  requestGarudaWalletRecovery,
  type GarudaWalletSecuritySummary,
} from "../../lib/web3/garudaWalletSecurityApi";
import { isGarudaNativeWalletClientEnabled } from "../../lib/web3/embeddedWalletConfig";
import { formatWalletAddressShort } from "../../lib/web3/connectedWalletUtils";
import { SecurityChallengeSheet } from "./SecuritySheets";

type WalletSecLabels = Record<string, string>;

const statusTone = (status?: string) => {
  if (status === "frozen") return "frozen" as const;
  if (status === "recovering") return "recovering" as const;
  return "active" as const;
};

export const GarudaWalletSecurityPanel = ({
  uid,
  labels,
  showToast,
  requireSecurityStep,
}: {
  uid: string;
  labels: WalletSecLabels;
  showToast: (msg: string, type?: "info" | "success" | "warning" | "error") => void;
  requireSecurityStep: () => Promise<boolean>;
}) => {
  const [summary, setSummary] = useState<GarudaWalletSecuritySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"freeze" | "recovery" | null>(null);
  const [freezeConfirmOpen, setFreezeConfirmOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!isGarudaNativeWalletClientEnabled()) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchGarudaWalletSecurity();
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, uid]);

  if (!isGarudaNativeWalletClientEnabled()) return null;

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!summary?.hasWallet) return null;

  const tone = statusTone(summary.status);

  const handleFreeze = async () => {
    if (!summary.address) return;
    const ok = await requireSecurityStep();
    if (!ok) {
      showToast(labels.walletSecChallengeRequired, "warning");
      return;
    }
    setBusy("freeze");
    try {
      await freezeGarudaNativeWallet(summary.address, uid);
      showToast(labels.walletSecFrozen, "success");
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : labels.walletSecFreezeFail, "error");
    } finally {
      setBusy(null);
      setFreezeConfirmOpen(false);
    }
  };

  const handleRecovery = async () => {
    const ok = await requireSecurityStep();
    if (!ok) {
      showToast(labels.walletSecChallengeRequired, "warning");
      return;
    }
    setBusy("recovery");
    try {
      await requestGarudaWalletRecovery("user_security_center");
      showToast(labels.walletSecRecoverySent, "success");
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : labels.walletSecRecoveryFail, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <SecuritySection title={labels.walletSecSection}>
        <div className="gp-security-row gp-security-row--static">
          <span className="gp-security-row__icon gp-security-row__icon--emerald">
            <Wallet className="w-4 h-4" strokeWidth={2} />
          </span>
          <span className="gp-security-row__body">
            <span className="gp-security-row__title">{labels.walletSecNative}</span>
            <span className="gp-security-row__desc">
              {summary.address ? formatWalletAddressShort(summary.address) : ", "}
            </span>
          </span>
          <span className={`gp-wallet-sec-badge gp-wallet-sec-badge--${tone}`}>
            {tone === "frozen" ? labels.walletSecStatusFrozen
              : tone === "recovering" ? labels.walletSecStatusRecovering
                : labels.walletSecStatusActive}
          </span>
        </div>

        {summary.status === "active" && (
          <SecurityRow
            icon={Snowflake}
            iconTone="cyan"
            title={labels.walletSecFreeze}
            desc={labels.walletSecFreezeDesc}
            onClick={() => setFreezeConfirmOpen(true)}
            disabled={busy !== null}
            trailing={busy === "freeze" ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            showChevron
          />
        )}

        {(summary.status === "frozen" || summary.status === "recovering") && (
          <SecurityRow
            icon={RotateCcw}
            iconTone="emerald"
            title={labels.walletSecRecovery}
            desc={labels.walletSecRecoveryDesc}
            onClick={() => void handleRecovery()}
            disabled={busy !== null || summary.status === "recovering"}
            trailing={busy === "recovery" ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            showChevron
          />
        )}
      </SecuritySection>

      <SecurityChallengeSheet
        open={freezeConfirmOpen}
        onClose={() => setFreezeConfirmOpen(false)}
        uid={uid}
        labels={{
          title: labels.walletSecFreezeConfirmTitle,
          intro: labels.walletSecFreezeConfirmBody,
          totpLabel: labels.challengeTotp ?? "2FA",
          pinLabel: labels.challengePin ?? "PIN",
          biometric: labels.challengeBiometric ?? "Biometrik",
          confirm: labels.challengeConfirm ?? "Konfirmasi",
          invalid: labels.invalidCode ?? "Kode tidak valid",
        }}
        onVerified={() => void handleFreeze()}
      />
    </>
  );
};
