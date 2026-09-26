import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, isFirebaseConfigured } from "./config";

/** Waits for Firebase Auth init; returns uid only when Firestore requests are authenticated. */
export const useFirebaseAuthUid = () => {
  const [uid, setUid] = useState<string | null>(() => auth?.currentUser?.uid ?? null);
  const [ready, setReady] = useState(!isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setReady(true);
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      setReady(true);
    });
    return unsub;
  }, []);

  return { uid, ready, isAuthenticated: Boolean(uid) };
};
