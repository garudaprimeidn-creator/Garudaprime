import React, { Suspense, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { fetchGarudaWalletSecurity } from "../../lib/web3/garudaWalletSecurityApi";
import { isGarudaNativeWalletClientEnabled } from "../../lib/web3/embeddedWalletConfig";
import type { RecoveryFlowLabels } from "./recoveryFlowTypes";

const RecoveryFlow = React.lazy(() =>
  import("./GarudaWalletRecoveryFlow").then((m) => ({ default: m.GarudaWalletRecoveryFlow })),
);

type Props = {
  labels: RecoveryFlowLabels & {
    intro: string;
    garudaWallet: string;
    noWallet: string;
    notEnabled: string;
  };
  showToast: (msg: string, type?: "info" | "success" | "warning" | "error") => void;
};

export function WalletBackupPanel({ labels, showToast }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [garudaAddress, setGarudaAddress] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(false);
  const [started, setStarted] = useState(false);

  const reload = useCallback(async () => {
    if (!user?.uid || !isGarudaNativeWalletClientEnabled()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const security = await fetchGarudaWalletSecurity().catch(() => null);
      setHasWallet(Boolean(security?.hasWallet));
      setGarudaAddress(security?.address ?? null);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!isGarudaNativeWalletClientEnabled()) {
    return <p className="gp-muted text-sm text-center py-8">{labels.notEnabled}</p>;
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!user?.uid || !hasWallet || !garudaAddress) {
    return <p className="gp-muted text-sm text-center py-8">{labels.noWallet}</p>;
  }

  if (!started) {
    return (
      <div className="space-y-4">
        <p className="gp-muted text-xs leading-relaxed">{labels.intro}</p>
        <button
          type="button"
          onClick={() => setStarted(true)}
          className="w-full py-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold text-sm gp-hover-row"
        >
          {labels.stepPassword}
        </button>
      </div>
    );
  }

  return (
    <Suspense
      fallback={(
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
        </div>
      )}
    >
      <RecoveryFlow
        mode="backup"
        uid={user.uid}
        garudaAddress={garudaAddress}
        labels={labels}
        showToast={showToast}
        onBackupDone={() => setStarted(false)}
      />
    </Suspense>
  );
}
