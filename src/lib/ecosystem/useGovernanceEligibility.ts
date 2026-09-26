import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../app/AppContext";
import { useAuth } from "../../contexts/AuthContext";
import { useFirebaseAuthUid } from "../firebase/useFirebaseAuthUid";
import { userHasCommunityActivity } from "../firebase/communityFeedService";
import { isGovernanceEnabled } from "./garudaEcosystem";

export type GovernanceEligibility = {
  loading: boolean;
  eligible: boolean;
  holdsGat: boolean;
  communityActive: boolean;
};

export const useGovernanceEligibility = (): GovernanceEligibility => {
  const { tokens, walletAddress } = useApp();
  const { connectedWallet } = useAuth();
  const { uid, ready: authReady } = useFirebaseAuthUid();
  const [communityActive, setCommunityActive] = useState(false);
  const [checked, setChecked] = useState(false);

  const gatBalance = tokens.find((t) => t.symbol === "GAT")?.balance ?? 0;
  const holdsGat = gatBalance > 0;

  useEffect(() => {
    if (!isGovernanceEnabled()) {
      setCommunityActive(false);
      setChecked(true);
      return;
    }
    if (!authReady) return;
    if (!uid) {
      setCommunityActive(false);
      setChecked(true);
      return;
    }
    let cancel = false;
    userHasCommunityActivity(uid).then((active) => {
      if (!cancel) {
        setCommunityActive(active);
        setChecked(true);
      }
    });
    return () => { cancel = true; };
  }, [uid, authReady]);

  return useMemo(() => {
    const loading = isGovernanceEnabled() && authReady && Boolean(uid) && !checked;
    const eligible =
      isGovernanceEnabled() &&
      holdsGat &&
      communityActive &&
      Boolean(uid) &&
      Boolean(connectedWallet?.address ?? walletAddress);

    return { loading, eligible, holdsGat, communityActive };
  }, [
    checked,
    authReady,
    uid,
    holdsGat,
    communityActive,
    connectedWallet?.address,
    walletAddress,
  ]);
};
