import React, { useEffect, useRef } from "react";
import { useLanguage } from "../../app/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import { AppProvider, useApp } from "../../app/AppContext";
import { KycUpgradeFlow } from "../../app/KycUpgradeFlow";
import { readRegistrationWallet } from "../../lib/auth/accountSetup";

type Props = {
  onComplete: (submitted: boolean) => void;
  onBack: () => void;
};

function isKycPortIdentityVerified(status: string | undefined | null): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "verified" || s === "approved";
}

const RegistrationKycFlow = ({ onComplete, onBack }: Props) => {
  const { t } = useLanguage();
  const reg = t.registration;
  const { beginKycFlow, isKycVerified, isKycPending } = useApp();
  const { user, userProfile } = useAuth();
  const kycPortVerified = isKycPortIdentityVerified(
    userProfile?.kycStatus ?? user?.kycStatus,
  );

  const beganRef = useRef(false);
  const completedRef = useRef(false);

  useEffect(() => {
    if (beganRef.current) return;
    beganRef.current = true;
    beginKycFlow();
  }, [beginKycFlow]);

  useEffect(() => {
    if (completedRef.current) return;
    if (kycPortVerified || isKycPending || isKycVerified) {
      completedRef.current = true;
      onComplete(true);
    }
  }, [kycPortVerified, isKycPending, isKycVerified, onComplete]);

  const handleClose = () => {
    onComplete(isKycVerified || isKycPending);
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <KycUpgradeFlow
        registrationMode
        continueLabel={reg.continueBtn}
        onClose={handleClose}
        onBack={onBack}
        onKycPortVerified={() => onComplete(true)}
      />
      <div className="shrink-0 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          onClick={() => onComplete(false)}
          className="w-full text-center gp-muted text-xs py-2 underline-offset-2 hover:underline"
        >
          {reg.skipKycBtn}
        </button>
      </div>
    </div>
  );
};

export const RegistrationKycStep = ({ onComplete, onBack }: Props) => {
  const { t } = useLanguage();
  const { signOut, user, userProfile } = useAuth();
  const registrationWallet = readRegistrationWallet();

  return (
    <AppProvider
      onSignOut={signOut}
      kycBlockedMessage={t.toast.kycRequired}
      kycVerifiedMessage={t.toast.kycVerified}
      kycPendingMessage={t.toast.kycPending}
      profileName={user?.displayName ?? userProfile?.fullName}
      profileEmail={user?.email ?? userProfile?.email}
      profilePhone={user?.phone ?? userProfile?.phone}
      walletAddress={registrationWallet ?? undefined}
      userId={user?.uid}
      isDemoUser={Boolean(user?.isDemo)}
      kycTierFromServer={userProfile?.kycTier}
      kycStatusFromServer={userProfile?.kycStatus ?? user?.kycStatus}
      kycRejectionReasonFromServer={userProfile?.kycRejectionReason}
    >
      <RegistrationKycFlow onComplete={onComplete} onBack={onBack} />
    </AppProvider>
  );
};
