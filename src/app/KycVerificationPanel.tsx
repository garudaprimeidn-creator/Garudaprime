import React from "react";
import { ShieldCheck } from "lucide-react";
import { useApp } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import { ToolInfoBox } from "./ToolGuideSheet";
import { KYC_STEP_ICONS, KycStatusCard } from "./KycStatusCard";
import { KycPortVerificationBlock } from "../features/kyc/KycPortVerificationBlock";
import { useAuth } from "../contexts/AuthContext";

type Props = {
  onStartUpgrade: () => void;
};

export const KycVerificationPanel = ({ onStartUpgrade }: Props) => {
  const { refreshUserProfile } = useAuth();
  const {
    isKycVerified, isKycPending, isKycRejected, upgradingKyc, kycProgress, startKycUpgrade,
  } = useApp();
  const { t } = useLanguage();
  const pd = t.profileDetails;
  const kf = t.kycFlow;

  const kycDone = [kycProgress.identity, kycProgress.face, kycProgress.address, isKycVerified];
  const kycStatusLabel = isKycVerified ? pd.kycFull : isKycPending ? pd.kycPending : isKycRejected ? pd.kycRejected : pd.kycLimited;
  const kycStatusTone = isKycVerified ? "verified" : isKycPending ? "pending" : isKycRejected ? "rejected" : "limited";
  const kycProgressCount = kycDone.filter(Boolean).length;

  const kycSteps = pd.kycItems.map((title, idx) => {
    const done = kycDone[idx];
    const firstIncomplete = kycDone.findIndex((d) => !d);
    const state: "done" | "current" | "pending" = done
      ? "done"
      : idx === firstIncomplete
        ? "current"
        : "pending";
    return {
      icon: KYC_STEP_ICONS[idx] ?? ShieldCheck,
      title,
      desc: pd.kycStepDesc[idx] ?? "",
      state,
    };
  });

  const handleUpgrade = () => {
    if (isKycVerified) return;
    onStartUpgrade();
    startKycUpgrade();
  };

  const handleKycPortSynced = () => {
    void refreshUserProfile();
  };

  return (
    <div className="gp-panel-stack">
      <ToolInfoBox info={pd.kycVerificationInfo} features={[]} compact tone="emerald" />
      {!isKycVerified && (
        <KycPortVerificationBlock
          variant="profile"
          showManualDivider
          onVerified={handleKycPortSynced}
          onPending={handleKycPortSynced}
        />
      )}
      <KycStatusCard
        statusLabel={kycStatusLabel}
        statusTone={kycStatusTone}
        progressCount={kycProgressCount}
        totalSteps={kycDone.length}
        steps={kycSteps}
        banner={!isKycVerified ? pd.kycLimitedBanner : undefined}
        tierLabel={pd.kycTierLabel}
        progressLabel={pd.kycProgressLabel}
        stepDone={pd.kycStepDone}
        stepCurrent={pd.kycStepCurrent}
        stepPending={pd.kycStepPending}
        upgrading={upgradingKyc}
        upgradeLabel={isKycRejected ? kf.resubmitKyc : t.toolsPanel.upgradeKyc}
        processingLabel={pd.kycProcessing}
        onUpgrade={!isKycVerified ? handleUpgrade : undefined}
        verified={isKycVerified}
      />
    </div>
  );
};
