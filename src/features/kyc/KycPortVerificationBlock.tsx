import React from "react";
import { Loader2, ShieldCheck, ExternalLink, RefreshCw } from "lucide-react";
import { useLanguage } from "../../app/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import { showAppToast } from "../../app/appToast";
import { resolveFirebaseAuthToast } from "../../lib/firebase/authErrors";
import { isKycPortOAuthConfigured, openKycPortVerify } from "../../lib/kyc/kycportConfig";
import { fetchKycPortReachability, resolveKycPortOAuthReady, type KycPortReachability } from "../../lib/kyc/kycportApi";
import { formatKycPortTier, isKycPortAssuranceVerified } from "../../lib/kyc/kycportStatus";
import { KycPortAwaitingBanner } from "../auth/KycPortAwaitingBanner";

type Props = {
  variant?: "auth" | "profile" | "registration";
  compact?: boolean;
  onVerified?: () => void;
  onPending?: () => void;
  showManualDivider?: boolean;
};

export const KycPortVerificationBlock = ({
  variant = "profile",
  compact = false,
  onVerified,
  onPending,
  showManualDivider = true,
}: Props) => {
  const { t } = useLanguage();
  const kf = t.kycFlow as Record<string, string>;
  const toast = t.toast as Record<string, string>;
  const {
    loading,
    userProfile,
    startKycPortVerificationFlow,
    refreshUserProfile,
    kycportConnectionPending,
  } = useAuth();

  const [busy, setBusy] = React.useState(false);
  const [syncBusy, setSyncBusy] = React.useState(false);
  const [health, setHealth] = React.useState<KycPortReachability | null>(null);

  const [oauthReady, setOauthReady] = React.useState(isKycPortOAuthConfigured());

  React.useEffect(() => {
    let cancelled = false;
    void resolveKycPortOAuthReady().then((ready) => {
      if (!cancelled) setOauthReady(ready);
    });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    fetchKycPortReachability()
      .then((h) => { if (!cancelled) setHealth(h); })
      .catch(() => { if (!cancelled) setHealth(null); });
    return () => { cancelled = true; };
  }, []);

  const warnClass =
    "rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200/90 leading-relaxed";

  if (!oauthReady) {
    return (
      <p className={warnClass}>
        {kf.kycportNotConfigured ?? "KYC Port belum dikonfigurasi (Client ID)."}
      </p>
    );
  }

  const tierLabel = userProfile?.kycTier != null
    ? formatKycPortTier(userProfile.kycTier)
    : null;
  const kycVerified = isKycPortAssuranceVerified(userProfile?.kycStatus);

  const handleStart = async () => {
    setBusy(true);
    try {
      if (health?.apiDegraded) {
        showAppToast(
          typeof toast.kycportApiDegraded === "string"
            ? toast.kycportApiDegraded
            : "Server KYC Port sedang gangguan. Anda tetap bisa mengisi data; sinkron dari Garuda Prime setelah selesai.",
          "info",
        );
      }
      const result = await startKycPortVerificationFlow();
      await refreshUserProfile();

      if (result.verified) {
        showAppToast(toast.kycVerified ?? kf.kycportVerified ?? "KYC terverifikasi", "success");
        onVerified?.();
      } else if (result.status === "pending" || result.status === "submitted" || result.status === "unverified") {
        if (result.verificationUrl) {
          openKycPortVerify();
        }
        showAppToast(toast.kycportPending ?? "KYC sedang diproses di KYC Port", "info");
        onPending?.();
      } else if (result.verificationUrl) {
        openKycPortVerify();
        showAppToast(toast.kycportSessionStarted ?? "Portal KYC Port dibuka", "info");
      }
    } catch (e) {
      showAppToast(resolveFirebaseAuthToast(e, toast), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleSyncStatus = async () => {
    setSyncBusy(true);
    try {
      await refreshUserProfile();
      showAppToast(toast.kycportConnected ?? "Status KYC Port diperbarui", "success");
    } catch (e) {
      showAppToast(resolveFirebaseAuthToast(e, toast), "error");
    } finally {
      setSyncBusy(false);
    }
  };

  const cardClass =
    variant === "auth"
      ? "gp-auth-luxe-panel rounded-2xl p-4 border border-emerald-500/25"
      : "rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4";

  return (
    <div className="space-y-3">
      <KycPortAwaitingBanner />

      {health?.apiDegraded && (
        <p className={warnClass}>
          {typeof toast.kycportApiDegraded === "string"
            ? toast.kycportApiDegraded
            : "Server KYC Port sedang gangguan. Anda tetap bisa melanjutkan, sinkronkan status dari sini setelah selesai."}
        </p>
      )}

      <div className={cardClass}>
        {!compact && (
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold gp-text">{kf.kycportTitle}</p>
              <p className="text-xs gp-muted mt-1 leading-relaxed">{kf.kycportDesc}</p>
              <p className="text-[10px] gp-muted mt-2 leading-relaxed">{kf.kycportReturnHint}</p>
            </div>
          </div>
        )}
        {compact && (
          <p className="mb-3 text-[11px] gp-muted leading-relaxed">
            {kf.kycportDescCompact ?? kf.kycportDesc}
          </p>
        )}

        {(tierLabel || kycVerified) && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {tierLabel ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 uppercase">
                {kf.kycportTierLabel ?? "Tingkat"} {tierLabel}
              </span>
            ) : null}
            {kycVerified ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                {kf.kycportVerified ?? "Terverifikasi"}
              </span>
            ) : null}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy || loading || kycportConnectionPending}
            onClick={() => void handleStart()}
            className={
              variant === "auth"
                ? "gp-auth-btn gp-auth-btn--luxe w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                : "w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            }
          >
            {busy || loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
            {kf.kycportCta}
          </button>

          <button
            type="button"
            disabled={syncBusy || loading}
            onClick={() => void handleSyncStatus()}
            className="w-full py-2.5 rounded-xl border border-emerald-500/30 text-sm font-semibold gp-text flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {syncBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 text-emerald-400" />
            )}
            {kf.kycportCheck ?? "Periksa Status KYCPORT"}
          </button>
        </div>
      </div>

      {showManualDivider && (
        <div className="flex items-center gap-3 py-1">
          <div className="flex-1 h-px bg-[rgba(var(--lx-line),0.35)]" />
          <span className="text-[10px] uppercase tracking-widest gp-muted">{kf.kycportDivider}</span>
          <div className="flex-1 h-px bg-[rgba(var(--lx-line),0.35)]" />
        </div>
      )}
    </div>
  );
};
