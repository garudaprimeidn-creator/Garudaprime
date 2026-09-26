import React, { useEffect, useState } from "react";
import {
  X, ChevronLeft, ChevronRight, Settings, Shield, Fingerprint, Wallet,
  CreditCard, Crown, Award, CheckCircle, AlertCircle, Lock, User, Mail, Phone, Trash2, AlertTriangle, Coins, MapPin, LogOut, ShieldCheck, HardDriveDownload, Loader2,
} from "lucide-react";
import { useApp, type ProfileSection } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import { AppearanceSettings } from "./AppearanceSettings";
import { CustomTokenSettings } from "./CustomTokenSettings";
import { ShippingSettings } from "./ShippingSettings";
import { ProfileAvatar } from "./ProfileAvatar";
import { KycUpgradeFlow } from "./KycUpgradeFlow";
import { KycVerificationPanel } from "./KycVerificationPanel";
import { PROFILE_PHONE } from "./profileData";
import { SecuritySettingsPanel } from "../features/security/SecuritySettingsPanel";
import { buildRecoveryFlowLabels } from "../features/wallet/recoveryFlowLabels";
import { LogoutConfirmSheet } from "./LogoutConfirmSheet";

const WalletBackupPanel = React.lazy(() =>
  import("../features/wallet/WalletBackupPanel").then((m) => ({ default: m.WalletBackupPanel })),
);
import { useAuth } from "../contexts/AuthContext";
import { isKycPortOAuthConfigured } from "../lib/kyc/kycportConfig";

type SubView = ProfileSection;

const SyariahBadge = ({ className = "" }: { className?: string }) => {
  const { t } = useLanguage();
  return (
    <span className={`gp-profile-badge gp-profile-badge--syariah ${className}`}>
      <CheckCircle className="w-3 h-3" strokeWidth={2.5} /> {t.syariah}
    </span>
  );
};

const GoldBadge = ({ children }: { children: React.ReactNode }) => (
  <span className="gp-profile-badge gp-profile-badge--prime">{children}</span>
);

export const ProfilePanel = ({ onClose }: { onClose: () => void }) => {
  const {
    showToast, setScreen, isKycVerified, isKycPending, isKycRejected, upgradingKyc, startKycUpgrade,
    biometricEnabled, setBiometricEnabled, twoFactorEnabled, setTwoFactorEnabled,
    strictDeviceLock, setStrictDeviceLock, refreshSecurityPrefs,
    profileSection, profileName, profileEmail, profilePhone, removeProfilePhoto, profilePhotoUrl,
    openToolPanel, isShippingComplete, refreshReferralStats, requireSecurityStep,
  } = useApp();
  const { t, lang } = useLanguage();
  const pd = t.profileDetails;
  const tp = t.toolsPanel;
  const sm = t.sessionManager as Record<string, string>;
  const { user, signOut, updateProfile, loading: authLoading, resetPassword } = useAuth();
  const [sub, setSub] = useState<SubView>(profileSection);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const sec = t.security as Record<string, string>;
  const [accountName, setAccountName] = useState(profileName);
  const [accountEmail, setAccountEmail] = useState(profileEmail);
  const [accountPhone, setAccountPhone] = useState(profilePhone || PROFILE_PHONE);
  const [accountSaving, setAccountSaving] = useState(false);

  useEffect(() => {
    setSub(profileSection);
  }, [profileSection]);

  useEffect(() => {
    if (sub !== "account") return;
    setAccountName(profileName);
    setAccountEmail(profileEmail);
    setAccountPhone(profilePhone || "");
  }, [sub, profileName, profileEmail, profilePhone]);

  const handleMenu = (idx: number) => {
    if (idx === 0) setSub("account");
    else if (idx === 1) setSub("shipping");
    else if (idx === 2) setSub("security");
    else if (idx === 3) setSub("kyc");
    else if (idx === 4) { onClose(); setScreen("wallet"); }
    else if (idx === 5) setSub("walletBackup");
    else if (idx === 6) setSub("customTokens");
    else if (idx === 7) setSub("subscription");
    else if (idx === 8) openToolPanel("referral-dashboard");
  };

  const header = (title: string, back?: () => void) => (
    <div className="gp-panel-header flex items-center gap-2 p-4 pt-6 shrink-0">
      {back && (
        <button type="button" onClick={back} className="gp-icon-btn p-1 -ml-1">
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      <h3 className="gp-text font-bold text-base flex-1">{title}</h3>
      <button type="button" onClick={onClose} className="gp-muted gp-icon-btn p-1"><X className="w-4 h-4" /></button>
    </div>
  );

  if (sub === "kyc-flow") {
    return <KycUpgradeFlow onClose={onClose} onBack={() => setSub("kyc")} />;
  }

  if (sub === "kyc") {
    return (
      <div className="flex flex-col h-full">
        {header(pd.kycVerificationTitle, () => setSub("main"))}
        <div className="gp-panel-body p-4" style={{ scrollbarWidth: "none" }}>
          <KycVerificationPanel onStartUpgrade={() => setSub("kyc-flow")} />
        </div>
      </div>
    );
  }

  if (sub === "shipping") {
    return (
      <div className="flex flex-col h-full">
        {header(pd.shippingTitle, () => setSub("main"))}
        <div className="gp-panel-body p-4" style={{ scrollbarWidth: "none" }}>
          <ShippingSettings />
        </div>
      </div>
    );
  }

  if (sub === "account") {
    return (
      <div className="flex flex-col h-full">
        {header(pd.accountTitle, () => setSub("main"))}
        <div className="gp-panel-body p-4 space-y-3" style={{ scrollbarWidth: "none" }}>
          <div className="flex flex-col items-center py-2">
            <ProfileAvatar size="lg" editable />
            {profilePhotoUrl && (
              <button
                type="button"
                onClick={() => { removeProfilePhoto(); showToast(pd.removePhoto, "info"); }}
                className="mt-2 flex items-center gap-1 text-[10px] text-red-400 font-semibold"
              >
                <Trash2 className="w-3 h-3" /> {pd.removePhoto}
              </button>
            )}
          </div>
          {[
            { icon: <User className="w-4 h-4" />, label: pd.fullName, value: accountName, onChange: setAccountName, type: "text" as const, placeholder: pd.fullName },
            { icon: <Mail className="w-4 h-4" />, label: pd.email, value: accountEmail, onChange: setAccountEmail, type: "email" as const, placeholder: "email@example.com" },
            { icon: <Phone className="w-4 h-4" />, label: pd.phone, value: accountPhone, onChange: setAccountPhone, type: "tel" as const, placeholder: "+62..." },
          ].map((row) => (
            <div key={row.label} className="gp-glass border rounded-xl p-3 flex items-center gap-3">
              <span className="gp-muted shrink-0">{row.icon}</span>
              <div className="flex-1 min-w-0">
                <label className="gp-muted text-[10px] uppercase tracking-wide block mb-1">{row.label}</label>
                <input
                  type={row.type}
                  value={row.value}
                  onChange={(e) => row.onChange(e.target.value)}
                  placeholder={row.placeholder}
                  className="w-full bg-transparent gp-text text-sm font-medium outline-none placeholder:gp-muted/60"
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            disabled={accountSaving || authLoading}
            onClick={async () => {
              const name = accountName.trim();
              if (!name) {
                showToast(pd.fullNameRequired, "error");
                return;
              }
              setAccountSaving(true);
              try {
                await updateProfile({
                  fullName: name,
                  email: accountEmail.trim(),
                  phone: accountPhone.trim(),
                });
                await refreshReferralStats();
                showToast(pd.accountSaved, "success");
              } catch {
                showToast(pd.accountSaveFailed, "error");
              } finally {
                setAccountSaving(false);
              }
            }}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm disabled:opacity-60"
          >
            {accountSaving ? pd.saving : pd.saveChanges}
          </button>
        </div>
      </div>
    );
  }

  if (sub === "security") {
    return (
      <>
        <div className="flex flex-col h-full">
          {header(pd.securityTitle, () => setSub("main"))}
          <div className="gp-panel-body gp-security-scene" style={{ scrollbarWidth: "none" }}>
            {user ? (
              <SecuritySettingsPanel
                user={user}
                profileEmail={profileEmail}
                profileName={profileName}
                pd={pd}
                tp={tp}
                sm={sm}
                sec={sec}
                twoFactorEnabled={twoFactorEnabled}
                biometricEnabled={biometricEnabled}
                strictDeviceLock={strictDeviceLock}
                isKycVerified={isKycVerified}
                setTwoFactorEnabled={setTwoFactorEnabled}
                setBiometricEnabled={setBiometricEnabled}
                setStrictDeviceLock={setStrictDeviceLock}
                refreshSecurityPrefs={refreshSecurityPrefs}
                resetPassword={resetPassword}
                openToolPanel={openToolPanel}
                showToast={showToast}
                signOut={signOut}
                onOpenKyc={() => setSub("kyc")}
                onRequestLogout={() => setLogoutOpen(true)}
                requireSecurityStep={requireSecurityStep}
              />
            ) : (
              <p className="gp-muted text-sm text-center py-8">{pd.securityInfo}</p>
            )}
          </div>
        </div>
        <LogoutConfirmSheet
          open={logoutOpen}
          onClose={() => setLogoutOpen(false)}
          onConfirm={signOut}
        />
      </>
    );
  }

  if (sub === "walletBackup") {
    return (
      <div className="flex flex-col h-full">
        {header(pd.walletBackupTitle, () => setSub("main"))}
        <div className="gp-panel-body p-4" style={{ scrollbarWidth: "none" }}>
          <React.Suspense
            fallback={(
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
              </div>
            )}
          >
            <WalletBackupPanel
              labels={{
                ...buildRecoveryFlowLabels(pd),
                intro: pd.walletBackupIntro,
                garudaWallet: pd.walletBackupGaruda,
                noWallet: pd.walletBackupNoWallet,
                notEnabled: pd.walletBackupNotEnabled,
              }}
              showToast={showToast}
            />
          </React.Suspense>
        </div>
      </div>
    );
  }

  if (sub === "customTokens") {
    return (
      <div className="flex flex-col h-full">
        {header(pd.customTokensTitle, () => setSub("main"))}
        <div className="gp-panel-body p-4" style={{ scrollbarWidth: "none" }}>
          <CustomTokenSettings />
        </div>
      </div>
    );
  }

  if (sub === "subscription") {
    return (
      <div className="flex flex-col h-full">
        {header(pd.subscriptionTitle, () => setSub("main"))}
        <div className="gp-panel-body p-4 space-y-3" style={{ scrollbarWidth: "none" }}>
          <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-emerald-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5 text-amber-400 fill-amber-400/30" />
              <span className="gp-text font-bold">{pd.planName}</span>
            </div>
            <p className="text-2xl font-black gp-num gp-text mb-1">{pd.planPrice}</p>
            <p className="gp-muted text-xs">{pd.planBilling}</p>
          </div>
          <ul className="space-y-2">
            {pd.planBenefits.map((b) => (
              <li key={b} className="flex items-start gap-2 gp-muted text-sm">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> {b}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => showToast(pd.planManaged, "info")}
            className="w-full py-3 rounded-xl border border-emerald-500/30 text-emerald-400 font-semibold text-sm gp-hover-row"
          >
            {pd.managePlan}
          </button>
        </div>
      </div>
    );
  }

  const kycStatusLabel = isKycVerified ? pd.kycFull : isKycPending ? pd.kycPending : isKycRejected ? pd.kycRejected : pd.kycLimited;
  const kycStatusTone = isKycVerified ? "verified" : isKycPending ? "pending" : isKycRejected ? "rejected" : "limited";

  const menuItems = [
    { icon: Settings, idx: 0 },
    { icon: MapPin, idx: 1, warn: !isShippingComplete },
    { icon: Shield, idx: 2 },
    { icon: ShieldCheck, idx: 3, warn: !isKycVerified },
    { icon: Wallet, idx: 4 },
    { icon: HardDriveDownload, idx: 5 },
    { icon: Coins, idx: 6 },
    { icon: CreditCard, idx: 7 },
    { icon: Crown, idx: 8 },
  ] as const;

  return (
    <div className="gp-profile-panel__root">
      <header className="gp-profile-panel__header">
        <div className="gp-profile-panel__header-spacer" aria-hidden />
        <h3 className="gp-profile-panel__title">{t.profile}</h3>
        <button type="button" onClick={onClose} className="gp-profile-panel__close" aria-label="Close">
          <X className="w-4 h-4" strokeWidth={2} />
        </button>
      </header>

      <div className="gp-profile-panel__scroll">
        <section className="gp-profile-hero">
          <div className="gp-profile-hero__glow" aria-hidden />
          <div className="gp-profile-hero__avatar-wrap">
            <ProfileAvatar size="md" editable rounded="full" className="gp-profile-hero__avatar" />
          </div>
          <h4 className="gp-profile-hero__name">{profileName}</h4>
          <p className="gp-profile-hero__email">{profileEmail || "-"}</p>
          <div className="gp-profile-hero__badges">
            <SyariahBadge />
            <GoldBadge><Award className="w-3 h-3 fill-amber-400/90" strokeWidth={0} /> {t.primeMember}</GoldBadge>
            <span className={`gp-profile-status gp-profile-status--${kycStatusTone} shrink-0`}>
              {kycStatusLabel}
            </span>
          </div>
          <div className="gp-profile-hero__prefs">
            <span className="gp-profile-hero__prefs-label">{t.appearance}</span>
            <AppearanceSettings compact />
          </div>
        </section>

        {!isKycVerified && isKycPortOAuthConfigured() && (
          <section className="gp-profile-block px-4 pb-1">
            <button
              type="button"
              onClick={() => setSub("kyc")}
              className="w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-left"
            >
              <p className="text-xs font-semibold text-emerald-400">{pd.kycVerificationTitle}</p>
              <p className="text-[11px] gp-muted mt-1 leading-relaxed">
                {lang === "id"
                  ? "Verifikasi identitas via KYC Port Sidra atau unggah dokumen di Garuda Prime."
                  : "Verify identity via KYC Port Sidra or upload documents in Garuda Prime."}
              </p>
            </button>
          </section>
        )}

        <section className="gp-profile-block gp-profile-block--menu">
          <p className="gp-profile-block__label gp-profile-block__label--section">
            {lang === "id" ? "Layanan & Pengaturan" : "Services & Settings"}
          </p>
          <div className="gp-profile-list">
            {menuItems.map(({ icon: Icon, idx, warn }) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleMenu(idx)}
                className="gp-profile-list__row"
              >
                <span className="gp-profile-list__icon">
                  <Icon className="w-[17px] h-[17px]" strokeWidth={1.75} />
                </span>
                <span className="gp-profile-list__label">{pd.menu[idx]}</span>
                {warn && <span className="gp-profile-list__dot" aria-label="Incomplete" />}
                <ChevronRight className="gp-profile-list__chev" strokeWidth={2} />
              </button>
            ))}
          </div>
        </section>

        <button type="button" onClick={() => setLogoutOpen(true)} className="gp-profile-logout">
          <LogOut className="w-4 h-4" strokeWidth={1.75} />
          {t.signOut}
        </button>
      </div>

      <LogoutConfirmSheet
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={signOut}
      />
    </div>
  );
};
