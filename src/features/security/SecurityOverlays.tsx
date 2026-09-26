import React, { useEffect, useState } from "react";
import { useApp } from "../../app/AppContext";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../app/LanguageContext";
import {
  subscribeAppLock, isAppLocked, unlockApp, startActivityWatcher, checkIdleLock,
} from "../../lib/security/appLock";
import { AppLockOverlay, SecurityChallengeSheet } from "./SecuritySheets";

export const SecurityOverlays = () => {
  const { userId, securityChallengeOpen, resolveSecurityChallenge } = useApp();
  const { t } = useLanguage();
  const sec = t.security as Record<string, string>;
  const [locked, setLocked] = useState(() => isAppLocked());

  useEffect(() => {
    return subscribeAppLock(setLocked);
  }, []);

  useEffect(() => {
    if (!userId) return;
    checkIdleLock(userId);
    return startActivityWatcher(userId);
  }, [userId]);

  if (!userId) return null;

  return (
    <>
      <SecurityChallengeSheet
        open={securityChallengeOpen}
        onClose={() => resolveSecurityChallenge(false)}
        uid={userId}
        labels={{
          title: sec.challengeTitle,
          intro: sec.challengeIntro,
          totpLabel: sec.challengeTotp,
          pinLabel: sec.challengePin,
          biometric: sec.challengeBiometric,
          confirm: sec.challengeConfirm,
          invalid: sec.challengeInvalid,
        }}
        onVerified={() => resolveSecurityChallenge(true)}
      />
      {locked && (
        <AppLockOverlay
          uid={userId}
          labels={sec}
          onUnlocked={unlockApp}
        />
      )}
    </>
  );
};
