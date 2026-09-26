import { useEffect, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { isAccountSetupDoneOnDevice } from "../../lib/auth/accountSetup";
import { isGarudaNativeWalletClientEnabled } from "../../lib/web3/embeddedWalletConfig";
import { clearGarudaNativeWallets } from "../../lib/web3/garudaWalletBridge";
import {
  autoActivateGarudaPrimeWallet,
  isGarudaNativeSigningReady,
} from "../../lib/web3/garudaNativeProvision";

/**
 * Background: keeps Garuda Prime signer + Pay Hub active for every user who has linked the wallet.
 */
export function GarudaWalletBridge() {
  const { user, userProfile, phase } = useAuth();
  const provisionedRef = useRef<string | null>(null);

  useEffect(() => {
    const uid = user?.uid;
    const setupIncomplete = phase === "register" || phase === "verify"
      || (uid ? !isAccountSetupDoneOnDevice(uid) : true);

    if (!isGarudaNativeWalletClientEnabled() || !uid || setupIncomplete) {
      clearGarudaNativeWallets();
      provisionedRef.current = null;
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const active = await autoActivateGarudaPrimeWallet(user.uid, {
          profileAddress: userProfile?.walletAddress,
        });
        if (cancelled) return;

        if (active) {
          provisionedRef.current = active.toLowerCase();
          return;
        }

        if (isGarudaNativeSigningReady(userProfile?.walletAddress)) {
          provisionedRef.current = userProfile?.walletAddress?.toLowerCase() ?? null;
          return;
        }

        provisionedRef.current = null;
      } catch {
        if (!cancelled) {
          provisionedRef.current = null;
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, userProfile?.walletAddress, userProfile?.kycStatus, userProfile?.kycTier, phase]);

  return null;
}
