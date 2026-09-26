import React, { useMemo, useState } from "react";
import {
  ChevronLeft, X, CheckCircle, Upload, Camera, Shield,
  FileText, Loader2, AlertCircle, Navigation, User, UserCheck,
} from "lucide-react";
import { useApp } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { KycPortVerificationBlock } from "../features/kyc/KycPortVerificationBlock";
import { KtpSelfiePanel } from "../features/kyc/KtpSelfiePanel";
import { LivenessSelfiePanel } from "../features/kyc/LivenessSelfiePanel";
import { KycAutoVerifyPanel } from "../features/kyc/KycAutoVerifyPanel";
import { type KycAddress } from "../lib/merchant/kycAddress";
import { INDONESIA_PROVINCES } from "../lib/kyc/indonesiaRegions";
import {
  buildAddressVerification,
  captureGeoLocation,
  GeoCaptureError,
} from "../lib/kyc/addressVerification";
import {
  areIdDocumentsComplete,
  getCaptureRequirements,
  getAvailableDocTypes,
  isSelfieStepComplete,
  isPersonalDataStepComplete,
  KYC_FLOW_REVIEW_STEP,
  regionFieldLabel,
  type KycDocType,
} from "../lib/kyc/kycWorkflow";
import { RESIDENCE_COUNTRIES, countryLabel } from "../lib/kyc/countries";
import { SelectionPills } from "../features/kyc/SelectionPills";
import { prepareKycImageForUpload } from "../lib/kyc/kycImagePrep";
import { preferNativeKycCapture } from "../lib/kyc/kycCaptureUtils";
import type { KycDocUploadStatus } from "../lib/kyc/kycPreuploadCache";

function UploadStatusBadge({ status, errorDetail, hasLocal, labels }: {
  status: KycDocUploadStatus;
  errorDetail?: string | null;
  hasLocal?: boolean;
  labels: { uploading: string; ready: string; error: string; idle: string; local?: string };
}) {
  if (status === "ready") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-emerald-400">
        <CheckCircle className="w-3.5 h-3.5" /> {labels.ready}
      </span>
    );
  }
  if (status === "uploading") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-sky-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> {labels.uploading}
      </span>
    );
  }
  if (status === "error") {
    const short = errorDetail?.split(":").pop()?.trim() ?? labels.error;
    return (
      <span className="flex flex-col items-end gap-0.5 max-w-[55%]">
        <span className="flex items-center gap-1 text-[10px] text-red-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {labels.error}
        </span>
        {short && (
          <span className="text-[9px] text-red-400/80 text-right leading-tight">{short}</span>
        )}
      </span>
    );
  }
  if (hasLocal) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-emerald-400/80">
        <CheckCircle className="w-3.5 h-3.5" /> {labels.local ?? labels.ready}
      </span>
    );
  }
  return <span className="text-[10px] gp-muted">{labels.idle}</span>;
}

const STEP_ICONS = [
  <User className="w-5 h-5" />,
  <FileText className="w-5 h-5" />,
  <Camera className="w-5 h-5" />,
  <UserCheck className="w-5 h-5" />,
  <Shield className="w-5 h-5" />,
];

function isKycPortIdentityVerified(status: string | undefined | null): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "verified" || s === "approved";
}

export const KycUpgradeFlow = ({
  onClose,
  onBack,
  registrationMode = false,
  continueLabel,
  onKycPortVerified,
}: {
  onClose: () => void;
  onBack: () => void;
  registrationMode?: boolean;
  continueLabel?: string;
  /** Registration: lanjut ke langkah keamanan setelah KYC Port terverifikasi. */
  onKycPortVerified?: () => void;
}) => {
  const {
    kycFlowStep, kycFlowData, submitKycStep, isKycVerified, isKycPending, isKycRejected,
    kycRejectionReason, kycResubmitMode, kycSubmitProgress, kycDocUploadStatus, kycDocUploadErrors,
    upgradingKyc, startKycUpgrade, isDemoUser,
  } = useApp();
  const { refreshUserProfile, user, userProfile } = useAuth();
  const kycPortIdentityVerified = isKycPortIdentityVerified(
    userProfile?.kycStatus ?? user?.kycStatus,
  );
  const { t, lang } = useLanguage();
  const k = t.kycFlow;
  const docLabels = k.docTypes as Record<KycDocType, string>;
  const countryOptions = useMemo(
    () => RESIDENCE_COUNTRIES.map((c) => ({
      value: c.code,
      label: `${countryLabel(c.code, lang)} (${c.code})`,
    })),
    [lang],
  );
  const docTypeOptions = useMemo(
    () => getAvailableDocTypes(kycFlowData.country).map((type) => ({
      value: type,
      label: docLabels[type] ?? type,
    })),
    [kycFlowData.country, docLabels],
  );
  const otherDocIncomplete = kycFlowData.documentType === "other"
    && kycFlowData.documentTypeOther.trim().length < 2;
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [photoPreparing, setPhotoPreparing] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const useNativeCapture = preferNativeKycCapture();

  const steps = k.steps;
  const current = kycFlowStep;
  const isReview = current === KYC_FLOW_REVIEW_STEP;
  const isProcessing = upgradingKyc;

  const ContinueBtn = registrationMode ? (
    <button
      type="button"
      onClick={onClose}
      className="gp-auth-btn gp-auth-btn--luxe w-full max-w-xs py-3 rounded-xl text-sm font-semibold mt-6"
    >
      {continueLabel ?? k.continueSetup ?? "Continue"}
    </button>
  ) : null;

  const CloseButton = registrationMode ? (
    <span className="w-7 shrink-0" aria-hidden />
  ) : (
    <button type="button" onClick={onClose} className="gp-muted gp-icon-btn p-1">
      <X className="w-4 h-4" />
    </button>
  );

  const addressVerification = useMemo(
    () => buildAddressVerification(
      kycFlowData.domicile,
      kycFlowData.ktpExtracted,
      kycFlowData.geo,
    ),
    [kycFlowData.domicile, kycFlowData.ktpExtracted, kycFlowData.geo],
  );

  const captureReq = useMemo(
    () => getCaptureRequirements(kycFlowData.country, kycFlowData.documentType),
    [kycFlowData.country, kycFlowData.documentType],
  );

  const regionLabel = regionFieldLabel(kycFlowData.country, lang);
  const isIndonesia = kycFlowData.country === "ID";

  const personalComplete = isPersonalDataStepComplete(
    {
      fullName: kycFlowData.personalFullName,
      email: kycFlowData.personalEmail,
      phone: kycFlowData.personalPhone,
    },
    kycFlowData.domicile,
    kycFlowData.documentType,
    kycFlowData.documentTypeOther,
    captureReq.gpsRequired,
    kycFlowData.geo,
  );

  const idDocumentsComplete = areIdDocumentsComplete(
    kycFlowData.idDocumentFront,
    kycFlowData.idDocumentBack,
    captureReq,
  );
  const selfieStepComplete = isSelfieStepComplete(
    {
      ktpSelfieFront: kycFlowData.ktpSelfieFront,
      ktpSelfieBack: kycFlowData.ktpSelfieBack,
      faceCapture: kycFlowData.faceCapture,
      livenessPassed: kycFlowData.livenessPassed,
    },
    captureReq,
  );
  const autoVerifyComplete = kycFlowData.autoVerifyComplete;

  const handleFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "idDocumentFront" | "idDocumentBack" | "addressProof",
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (field !== "addressProof" && !file.type.startsWith("image/") && file.type !== "application/pdf") {
      setPhotoError(k.selfieCaptureError);
      return;
    }
    if (field === "idDocumentFront") submitKycStep("ktpExtracted", null);
    setPhotoError(null);
    setPhotoPreparing(field);
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result;
      if (typeof raw !== "string") {
        setPhotoError(k.selfieCaptureError);
        setPhotoPreparing(null);
        return;
      }
      void prepareKycImageForUpload(raw, "id-document")
        .then((compressed) => submitKycStep(field, compressed))
        .catch(() => submitKycStep(field, raw))
        .finally(() => setPhotoPreparing(null));
    };
    reader.onerror = () => {
      setPhotoError(k.selfieCaptureError);
      setPhotoPreparing(null);
    };
    reader.readAsDataURL(file);
  };

  const renderIdUpload = (
    field: "idDocumentFront" | "idDocumentBack",
    uploaded: string | null,
    title: string,
    uploadedLabel: string,
  ) => (
    <div className="space-y-2">
      <p className="gp-text text-xs font-semibold">{title}</p>
      <div className={`rounded-xl border-2 border-dashed overflow-hidden transition-colors ${
        uploaded ? "border-emerald-500/40 bg-emerald-500/[0.05]" : "gp-divider gp-subtle hover:border-emerald-500/30"
      }`}>
        {uploaded ? (
          <div className="relative">
            {uploaded.startsWith("data:application/pdf") ? (
              <div className="flex flex-col items-center justify-center py-10 px-4">
                <FileText className="w-10 h-10 text-emerald-400 mb-2" />
                <p className="gp-text text-xs font-semibold">{k.uploadSuccess}</p>
                <p className="gp-muted text-[10px] mt-1">{uploadedLabel}</p>
              </div>
            ) : (
              <>
                <img
                  src={uploaded}
                  alt={title}
                  className="w-full max-h-48 object-contain bg-black/20"
                />
                <div className="flex items-center gap-2 px-3 py-2 border-t gp-divider">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <p className="gp-text text-[11px] font-semibold">{uploadedLabel}</p>
                </div>
              </>
            )}
          </div>
        ) : useNativeCapture ? (
          <div className="p-6 text-center space-y-3">
            <Upload className="w-9 h-9 gp-muted mx-auto mb-2" />
            <p className="gp-muted text-[10px]">
              {photoPreparing === field ? k.preparingPhoto : k.uploadHint}
            </p>
            <label className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-xs cursor-pointer">
              <Camera className="w-3.5 h-3.5" />
              {k.takeSelfiePhoto}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFile(e, field)}
              />
            </label>
          </div>
        ) : (
          <label className="block cursor-pointer">
            <div className="p-6 text-center">
              <Upload className="w-9 h-9 gp-muted mx-auto mb-2" />
              <p className="gp-muted text-[10px]">
                {photoPreparing === field ? k.preparingPhoto : k.uploadHint}
              </p>
            </div>
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => handleFile(e, field)}
            />
          </label>
        )}
      </div>
      {!uploaded && useNativeCapture && (
        <label className="block cursor-pointer text-center">
          <span className="gp-muted text-[10px] underline">{k.selfieUploadHint}</span>
          <input
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => handleFile(e, field)}
          />
        </label>
      )}
    </div>
  );

  const setDomicile = (key: keyof KycAddress, value: string) => {
    submitKycStep("domicile", {
      ...kycFlowData.domicile,
      country: kycFlowData.country,
      [key]: value,
    });
  };

  const handleCaptureGps = () => {
    setGeoError(null);
    setGeoLoading(true);
    void captureGeoLocation()
      .then((geo) => submitKycStep("geo", geo))
      .catch((err: unknown) => {
        const code = err instanceof GeoCaptureError ? err.code : "position_unavailable";
        const messages: Record<string, string> = {
          permission_denied: k.geoErrorPermission,
          position_unavailable: k.geoErrorUnavailable,
          timeout: k.geoErrorTimeout,
          unsupported: k.geoErrorUnsupported,
          blocked: k.geoErrorBlocked,
        };
        setGeoError(messages[code] ?? k.geoError);
      })
      .finally(() => setGeoLoading(false));
  };

  const handleSubmit = () => {
    submitKycStep("submit");
  };

  type ReviewUploadKey = keyof typeof kycDocUploadStatus;
  const reviewUploadRows = useMemo(() => {
    const rows: { key: ReviewUploadKey; label: string; hasLocal: boolean }[] = [
      { key: "idDocumentFront", label: k.reviewUploadIdFront, hasLocal: !!kycFlowData.idDocumentFront },
    ];
    if (captureReq.idBack) {
      rows.push({ key: "idDocumentBack", label: k.reviewUploadIdBack, hasLocal: !!kycFlowData.idDocumentBack });
    }
    rows.push(
      { key: "ktpSelfieFront", label: k.reviewUploadSelfieFront, hasLocal: !!kycFlowData.ktpSelfieFront },
    );
    if (captureReq.selfieBack) {
      rows.push({ key: "ktpSelfieBack", label: k.reviewUploadSelfieBack, hasLocal: !!kycFlowData.ktpSelfieBack });
    }
    rows.push({ key: "livenessSelfie", label: k.reviewUploadLiveness, hasLocal: !!kycFlowData.faceCapture });
    return rows;
  }, [
    captureReq.idBack,
    captureReq.selfieBack,
    k,
    kycFlowData.idDocumentFront,
    kycFlowData.idDocumentBack,
    kycFlowData.ktpSelfieFront,
    kycFlowData.ktpSelfieBack,
    kycFlowData.faceCapture,
  ]);

  const docsUploading = reviewUploadRows.some((row) => kycDocUploadStatus[row.key] === "uploading");
  const docsHasError = reviewUploadRows.some((row) => kycDocUploadStatus[row.key] === "error");

  if (isKycVerified && !isProcessing) {
    return (
      <div className="flex flex-col h-full">
        <div className="gp-panel-header flex items-center gap-2 p-4 pt-6 shrink-0">
          <button type="button" onClick={onBack} className="gp-icon-btn p-1 -ml-1"><ChevronLeft className="w-5 h-5" /></button>
          <h3 className="gp-text font-bold text-base flex-1">{k.title}</h3>
          {CloseButton}
        </div>
        <div className="gp-panel-body flex flex-col items-center justify-center p-6 text-center">
          <CheckCircle className="w-16 h-16 text-emerald-400 mb-4" />
          <p className="gp-text font-bold text-lg">{k.verifiedTitle}</p>
          <p className="gp-muted text-sm mt-2 leading-relaxed">{k.verifiedDesc}</p>
          {ContinueBtn}
        </div>
      </div>
    );
  }

  if (isKycPending && !isProcessing) {
    return (
      <div className="flex flex-col h-full">
        <div className="gp-panel-header flex items-center gap-2 p-4 pt-6 shrink-0">
          <button type="button" onClick={onBack} className="gp-icon-btn p-1 -ml-1"><ChevronLeft className="w-5 h-5" /></button>
          <h3 className="gp-text font-bold text-base flex-1">{k.title}</h3>
          {CloseButton}
        </div>
        <div className="gp-panel-body flex flex-col items-center justify-center p-6 text-center">
          <Loader2 className="w-12 h-12 text-amber-400 mb-4" />
          <p className="gp-text font-bold text-lg">{k.pendingTitle}</p>
          <p className="gp-muted text-sm mt-2 leading-relaxed">{k.pendingDesc}</p>
          {ContinueBtn}
        </div>
      </div>
    );
  }

  if (isKycRejected && !isProcessing && !kycResubmitMode) {
    return (
      <div className="flex flex-col h-full">
        <div className="gp-panel-header flex items-center gap-2 p-4 pt-6 shrink-0">
          <button type="button" onClick={onBack} className="gp-icon-btn p-1 -ml-1"><ChevronLeft className="w-5 h-5" /></button>
          <h3 className="gp-text font-bold text-base flex-1">{k.title}</h3>
          {CloseButton}
        </div>
        <div className="gp-panel-body flex flex-col items-center justify-center p-6 text-center gap-4">
          <AlertCircle className="w-16 h-16 text-red-400" />
          <div>
            <p className="gp-text font-bold text-lg">{k.rejectedTitle}</p>
            <p className="gp-muted text-sm mt-2 leading-relaxed">{k.rejectedDesc}</p>
            {kycRejectionReason && (
              <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-300/90 leading-relaxed text-left">
                {kycRejectionReason}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => startKycUpgrade()}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm"
          >
            {k.resubmitKyc}
          </button>
        </div>
      </div>
    );
  }

  const StrengthBadge = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
      ok ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
    }`}>
      {ok ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      {label}
    </span>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="gp-panel-head shrink-0">
      <div className="gp-panel-header flex items-center gap-2 p-4 pt-6 shrink-0">
        <button type="button" onClick={onBack} className="gp-icon-btn p-1 -ml-1"><ChevronLeft className="w-5 h-5" /></button>
        <h3 className="gp-text font-bold text-base flex-1">{k.title}</h3>
        {CloseButton}
      </div>

      <div className="px-4 py-3 shrink-0">
        <p className="gp-muted text-[11px] mb-3 leading-relaxed">{k.subtitle}</p>
        <div className="flex items-center gap-1">
          {steps.map((label, i) => (
            <React.Fragment key={label}>
              <div className="flex flex-col items-center flex-1 min-w-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                  i < current ? "bg-emerald-500 text-black"
                    : i === current ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                    : "gp-subtle gp-muted"
                }`}>
                  {i < current ? <CheckCircle className="w-3.5 h-3.5" /> : STEP_ICONS[i]}
                </div>
                <p className={`text-[8px] mt-1 text-center leading-tight truncate w-full ${
                  i <= current ? "text-emerald-400 font-semibold" : "gp-muted"
                }`}>{label}</p>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-0.5 w-3 shrink-0 rounded ${i < current ? "bg-emerald-500" : "gp-subtle"}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
      </div>

      <div className="gp-panel-body p-4 space-y-4" style={{ scrollbarWidth: "none" }}>
        {registrationMode && current === 0 && !isKycVerified && !kycPortIdentityVerified && !isProcessing && (
          <KycPortVerificationBlock
            variant="registration"
            showManualDivider
            onVerified={() => {
              void refreshUserProfile().then(() => {
                onKycPortVerified?.();
              });
            }}
            onPending={() => {
              void refreshUserProfile();
            }}
          />
        )}
        {isProcessing ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <Loader2 className="w-12 h-12 text-emerald-400 animate-spin mb-4" />
            <p className="gp-text font-semibold">{k.processing}</p>
            {kycSubmitProgress ? (
              <>
                <p className="gp-text text-sm mt-3 font-medium">
                  {k.processingStep
                    .replace("{step}", String(kycSubmitProgress.step))
                    .replace("{total}", String(kycSubmitProgress.total))
                    .replace("{label}", kycSubmitProgress.label)}
                </p>
                <p className="gp-muted text-xs mt-2">
                  {kycSubmitProgress.phase === "compress"
                    ? k.processingCompress
                    : kycSubmitProgress.phase === "save"
                      ? k.processingSave
                      : kycSubmitProgress.phase === "upload"
                        ? k.processingUpload
                        : k.processingUpload}
                </p>
                <div className="mt-4 h-1.5 w-full max-w-xs rounded-full gp-subtle overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${Math.round((kycSubmitProgress.step / kycSubmitProgress.total) * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="gp-muted text-xs mt-2">{k.processingDesc}</p>
            )}
          </div>
        ) : current === 0 && (
          <>
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.05] p-3 space-y-3">
              <p className="gp-text text-xs font-semibold">{k.step1Title}</p>
              <p className="gp-muted text-[11px] leading-relaxed">{k.step1Desc}</p>
              <div>
                <label className="gp-muted text-[10px] font-semibold">{k.personalNameLabel}</label>
                <input
                  type="text"
                  value={kycFlowData.personalFullName}
                  onChange={(e) => submitKycStep("personalFullName", e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm"
                />
              </div>
              <div>
                <label className="gp-muted text-[10px] font-semibold">{k.personalEmailLabel}</label>
                <input
                  type="email"
                  value={kycFlowData.personalEmail}
                  onChange={(e) => submitKycStep("personalEmail", e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm"
                />
              </div>
              <div>
                <label className="gp-muted text-[10px] font-semibold">{k.personalPhoneLabel}</label>
                <input
                  type="tel"
                  value={kycFlowData.personalPhone}
                  onChange={(e) => submitKycStep("personalPhone", e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm"
                />
              </div>
              <div>
                <label className="gp-muted text-[10px] font-semibold">{k.countryLabel}</label>
                <SelectionPills
                  options={countryOptions}
                  value={kycFlowData.country}
                  onChange={(code) => submitKycStep("country", code)}
                />
              </div>
              <div>
                <label className="gp-muted text-[10px] font-semibold">{k.documentTypeLabel}</label>
                <SelectionPills
                  options={docTypeOptions}
                  value={kycFlowData.documentType}
                  onChange={(type) => submitKycStep("documentType", type)}
                />
              </div>
              {kycFlowData.documentType === "other" && (
                <div>
                  <label className="gp-muted text-[10px] font-semibold">{k.documentTypeOtherLabel}</label>
                  <input
                    type="text"
                    value={kycFlowData.documentTypeOther}
                    onChange={(e) => submitKycStep("documentTypeOther", e.target.value)}
                    placeholder={k.documentTypeOtherPlaceholder}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm"
                  />
                  <p className="gp-muted text-[10px] mt-1 leading-relaxed">{k.documentTypeOtherHint}</p>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 space-y-3">
              <div>
                <p className="gp-text text-xs font-semibold">{k.domicileTitle}</p>
                <p className="gp-muted text-[10px] mt-1 leading-relaxed">{k.domicileDesc}</p>
              </div>
              <div>
                <label className="gp-muted text-[10px] font-semibold">{k.domicileAddress}</label>
                <input
                  type="text"
                  value={kycFlowData.domicile.addressLine1}
                  onChange={(e) => setDomicile("addressLine1", e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm"
                />
              </div>
              <div>
                <label className="gp-muted text-[10px] font-semibold">{k.domicileAddress2}</label>
                <input
                  type="text"
                  value={kycFlowData.domicile.addressLine2}
                  onChange={(e) => setDomicile("addressLine2", e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="gp-muted text-[10px] font-semibold">{k.domicileCity}</label>
                  <input
                    type="text"
                    value={kycFlowData.domicile.city}
                    onChange={(e) => setDomicile("city", e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm"
                  />
                </div>
                <div>
                  <label className="gp-muted text-[10px] font-semibold">{k.domicilePostal}</label>
                  <input
                    type="text"
                    value={kycFlowData.domicile.postalCode}
                    onChange={(e) => setDomicile("postalCode", isIndonesia
                      ? e.target.value.replace(/\D/g, "").slice(0, 5)
                      : e.target.value.slice(0, 16))}
                    className={`mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm ${
                      kycFlowData.domicile.postalCode && !addressVerification.postalValid ? "border-amber-500/50" : ""
                    }`}
                  />
                </div>
              </div>
              <div>
                <label className="gp-muted text-[10px] font-semibold">{regionLabel}</label>
                <input
                  type="text"
                  list={isIndonesia ? "gp-provinces" : undefined}
                  value={kycFlowData.domicile.province}
                  onChange={(e) => setDomicile("province", e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm"
                />
                {isIndonesia && (
                  <datalist id="gp-provinces">
                    {INDONESIA_PROVINCES.map((p) => <option key={p} value={p} />)}
                  </datalist>
                )}
              </div>
            </div>

            <div className={`rounded-2xl border-2 p-4 space-y-3 ${
              kycFlowData.geo
                ? "border-emerald-500/40 bg-emerald-500/[0.05]"
                : "border-indigo-500/30 bg-indigo-500/[0.08]"
            }`}>
              <div className="flex items-start gap-3">
                <Navigation className={`w-5 h-5 shrink-0 ${kycFlowData.geo ? "text-emerald-400" : "text-indigo-300"}`} />
                <div className="flex-1 min-w-0">
                  <p className="gp-text text-sm font-semibold">{k.geoTitle}</p>
                  <p className="gp-muted text-[11px] mt-1 leading-relaxed">
                    {captureReq.gpsRequired ? k.geoDesc : k.geoDescOptional}
                  </p>
                </div>
              </div>
              {kycFlowData.geo ? (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 text-emerald-400 text-[11px]">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{k.geoCaptured}: {kycFlowData.geo.lat.toFixed(5)}, {kycFlowData.geo.lng.toFixed(5)}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleCaptureGps}
                  disabled={geoLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-semibold text-sm disabled:opacity-50"
                >
                  {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                  {k.geoButton}
                </button>
              )}
              {geoError && <p className="text-[10px] text-red-400">{geoError}</p>}
            </div>
          </>
        )}

        {!isProcessing && current === 1 && (
          <>
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.05] p-3">
              <p className="gp-text text-xs font-semibold">{k.step2Title}</p>
              <p className="gp-muted text-[11px] mt-1 leading-relaxed">{k.step2Desc}</p>
            </div>
            <div className="space-y-4">
              {renderIdUpload(
                "idDocumentFront",
                kycFlowData.idDocumentFront,
                k.uploadIdFront,
                k.idFrontUploaded,
              )}
              {captureReq.idBack && renderIdUpload(
                "idDocumentBack",
                kycFlowData.idDocumentBack,
                k.uploadIdBack,
                k.idBackUploaded,
              )}
            </div>
            {photoError && (
              <div className="flex items-start gap-2 text-red-400 text-[11px] px-1">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{photoError}</span>
              </div>
            )}
          </>
        )}

        {!isProcessing && current === 2 && (
          <>
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.05] p-3">
              <p className="gp-text text-xs font-semibold">{k.step3Title}</p>
              <p className="gp-muted text-[11px] mt-1 leading-relaxed">{k.step3Desc}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 space-y-3">
              <p className="gp-text text-xs font-semibold">{k.step3DocSelfieTitle}</p>
              <KtpSelfiePanel
                frontCapture={kycFlowData.ktpSelfieFront}
                backCapture={kycFlowData.ktpSelfieBack}
                requireBack={captureReq.selfieBack}
                labels={{
                  selfieFrontTitle: k.selfieFrontTitle,
                  selfieBackTitle: k.selfieBackTitle,
                  selfieHint: k.selfieHint,
                  takePhoto: k.takeSelfiePhoto,
                  retakePhoto: k.retakeSelfiePhoto,
                  captureError: k.selfieCaptureError,
                  permissionDenied: k.selfiePermissionDenied,
                  selfieComplete: k.selfieComplete,
                  uploadHint: k.selfieUploadHint,
                  cancel: k.selfieCancel,
                  preparingPhoto: k.preparingPhoto,
                }}
                onFrontCapture={(dataUrl) => submitKycStep("ktpSelfieFront", dataUrl)}
                onBackCapture={(dataUrl) => submitKycStep("ktpSelfieBack", dataUrl)}
              />
            </div>
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3 space-y-3">
              <p className="gp-text text-xs font-semibold">{k.step3LivenessTitle}</p>
              <LivenessSelfiePanel
              capture={kycFlowData.faceCapture}
              livenessPassed={kycFlowData.livenessPassed}
              labels={{
                title: k.livenessTitle,
                hint: k.livenessHint,
                challengeLook: k.livenessChallengeLook,
                challengeTurnLeft: k.livenessChallengeTurnLeft,
                challengeTurnRight: k.livenessChallengeTurnRight,
                challengeBlink: k.livenessChallengeBlink,
                blinkCounterLabel: k.livenessBlinkCounter,
                takePhoto: k.takeSelfiePhoto,
                retakePhoto: k.retakeSelfiePhoto,
                captureError: k.selfieCaptureError,
                permissionDenied: k.selfiePermissionDenied,
                complete: k.selfieComplete,
                uploadHint: k.selfieUploadHint,
                cancel: k.selfieCancel,
                preparingPhoto: k.preparingPhoto,
                livenessPassed: k.livenessPassed,
                loadingModel: k.livenessLoadingModel,
                faceNotDetected: k.livenessFaceNotDetected,
                positionInOval: k.livenessPositionInOval,
                showExpression: k.livenessShowExpression,
                keepMoving: k.livenessKeepMoving,
                holdStill: k.livenessHoldStill,
                livenessFailed: k.livenessFailed,
                livenessRetry: k.livenessRetry,
                antiSpoofFailed: k.livenessAntiSpoofFailed,
                cameraRequired: k.livenessCameraRequired,
                activeLivenessBadge: k.livenessActiveBadge,
                biometricActive: k.livenessBiometricActive,
              }}
              onCapture={(dataUrl) => submitKycStep("faceCapture", dataUrl)}
              onStepCapture={(step, dataUrl) => {
                if (step === 1) submitKycStep("livenessStep1Capture", dataUrl);
                if (step === 2) submitKycStep("livenessStep2Capture", dataUrl);
                if (step === 3) submitKycStep("livenessStep3Capture", dataUrl);
              }}
              onLivenessPassed={(score) => {
                submitKycStep("livenessScore", score);
                submitKycStep("livenessPassed", true);
              }}
              onReset={() => {
                submitKycStep("faceCapture", null);
                submitKycStep("livenessStep1Capture", null);
                submitKycStep("livenessStep2Capture", null);
                submitKycStep("livenessStep3Capture", null);
                submitKycStep("livenessPassed", false);
                submitKycStep("autoVerifyComplete", false);
              }}
            />
            </div>
          </>
        )}

        {!isProcessing && current === 3 && (
          <KycAutoVerifyPanel
            idFront={kycFlowData.idDocumentFront}
            selfie={kycFlowData.faceCapture}
            domicile={kycFlowData.domicile}
            ocrEnabled={captureReq.ocrEnabled}
            existingOcr={kycFlowData.ktpExtracted}
            labels={{
              title: k.autoVerifyTitle,
              desc: k.autoVerifyDesc,
              running: k.autoVerifyRunning,
              ocrTitle: k.autoVerifyOcrTitle,
              faceTitle: k.autoVerifyFaceTitle,
              ocrScore: k.autoVerifyOcrScore,
              faceScore: k.autoVerifyFaceScore,
              autoPassed: k.autoVerifyPassed,
              autoFailed: k.autoVerifyFailed,
              manualReview: k.autoVerifyManualReview,
              retry: k.autoVerifyRetry,
            }}
            onComplete={(result) => {
              submitKycStep("ktpExtracted", result.ocrExtract);
              submitKycStep("ocrMatchScore", result.ocrMatchScore);
              submitKycStep("faceMatchScore", result.faceMatchScore);
              submitKycStep("faceMatchPassed", result.faceMatchPassed);
              submitKycStep("autoVerifyComplete", true);
            }}
          />
        )}

        {!isProcessing && isReview && (
          <>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
              <p className="gp-text text-xs font-semibold">{k.step5Title}</p>
              <p className="gp-muted text-[11px] mt-1 leading-relaxed">{k.step5Desc}</p>
            </div>
            <div className="gp-glass border rounded-2xl p-4 space-y-3">
              {[
                { label: k.reviewPersonal, done: personalComplete, icon: <User className="w-4 h-4" /> },
                { label: k.reviewIdentity, done: idDocumentsComplete, icon: <FileText className="w-4 h-4" /> },
                { label: k.reviewFace, done: selfieStepComplete, icon: <Camera className="w-4 h-4" /> },
                { label: k.reviewAutoVerify, done: autoVerifyComplete, icon: <UserCheck className="w-4 h-4" /> },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="gp-muted">{row.icon}</span>
                  <span className="gp-text text-sm flex-1">{row.label}</span>
                  {row.done ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                  )}
                </div>
              ))}
            </div>
            <div className="gp-glass border rounded-2xl p-4 space-y-2.5">
              <p className="gp-text text-xs font-semibold mb-1">{k.reviewUploadTitle}</p>
              {reviewUploadRows.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-2">
                  <span className="gp-text text-[11px]">{row.label}</span>
                  <UploadStatusBadge
                    status={kycDocUploadStatus[row.key]}
                    errorDetail={kycDocUploadErrors[row.key]}
                    hasLocal={row.hasLocal && kycDocUploadStatus[row.key] === "idle"}
                    labels={{
                      uploading: k.uploadStatusUploading,
                      ready: k.uploadStatusReady,
                      error: k.uploadStatusError,
                      idle: k.uploadStatusIdle,
                      local: k.uploadStatusLocal,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.05] p-3">
              <p className="gp-text text-xs font-semibold mb-2">{k.addressStrengthTitle}</p>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 h-2 rounded-full gp-subtle overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      addressVerification.strengthScore >= 70 ? "bg-emerald-500"
                        : addressVerification.strengthScore >= 40 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${addressVerification.strengthScore}%` }}
                  />
                </div>
                <span className="gp-text text-sm font-bold">{addressVerification.strengthScore}%</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <StrengthBadge ok={addressVerification.postalValid} label={k.badgePostal} />
                <StrengthBadge ok={addressVerification.provinceValid} label={k.badgeProvince} />
                <StrengthBadge ok={addressVerification.postalProvinceMatch} label={k.badgePostalMatch} />
                {kycFlowData.ktpExtracted?.province && (
                  <StrengthBadge ok={addressVerification.ktpOcrMatchScore >= 50} label={`${k.badgeKtpMatch} ${addressVerification.ktpOcrMatchScore}%`} />
                )}
                <StrengthBadge ok={!!kycFlowData.geo} label={k.badgeGps} />
              </div>
            </div>
            <p className="gp-muted text-[10px] leading-relaxed px-1">{k.reviewNote}</p>
            <p className="gp-muted text-[10px] leading-relaxed px-1">{k.reviewAdminNote}</p>
            {isDemoUser && (
              <div className="gp-callout gp-callout--red">
                <p className="gp-callout__text">{k.demoKycBlocked}</p>
              </div>
            )}
            <div className="gp-callout gp-callout--emerald">
              <p className="gp-callout__text">
                {docsUploading ? k.preuploadWait : docsHasError ? k.preuploadRetryHint : k.preuploadHint}
              </p>
            </div>
          </>
        )}
      </div>

      {!isProcessing && (
        <div className="p-4 border-t gp-divider shrink-0">
          {isReview ? (
            <button
              type="button"
              disabled={
                !personalComplete
                || !idDocumentsComplete
                || !selfieStepComplete
                || !autoVerifyComplete
                || otherDocIncomplete
                || docsUploading
                || isDemoUser
              }
              onClick={handleSubmit}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <Shield className="w-4 h-4" /> {k.submitKyc}
            </button>
          ) : (
            <button
              type="button"
              disabled={
                (current === 0 && (!personalComplete || otherDocIncomplete))
                || (current === 1 && !idDocumentsComplete)
                || (current === 2 && !selfieStepComplete)
                || (current === 3 && !autoVerifyComplete)
              }
              onClick={() => submitKycStep("next")}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm disabled:opacity-40"
            >
              {k.continue}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
