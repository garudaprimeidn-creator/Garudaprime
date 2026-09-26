import React, { useEffect, useState } from "react";
import { CheckCircle, AlertCircle, Loader2, ScanLine, UserCheck } from "lucide-react";
import { runKycAutoVerification, type KycAutoVerifyResult } from "../../lib/kyc/kycAutoVerification";
import type { KycAddress } from "../../lib/merchant/kycAddress";
import type { KtpOcrExtract } from "../../lib/kyc/ktpAddressOcr";

export type KycAutoVerifyLabels = {
  title: string;
  desc: string;
  running: string;
  ocrTitle: string;
  faceTitle: string;
  ocrScore: string;
  faceScore: string;
  autoPassed: string;
  autoFailed: string;
  manualReview: string;
  retry: string;
};

type Props = {
  idFront: string | null;
  selfie: string | null;
  domicile: KycAddress;
  ocrEnabled: boolean;
  existingOcr?: KtpOcrExtract | null;
  labels: KycAutoVerifyLabels;
  onComplete: (result: KycAutoVerifyResult) => void;
};

export function KycAutoVerifyPanel({
  idFront,
  selfie,
  domicile,
  ocrEnabled,
  existingOcr,
  labels,
  onComplete,
}: Props) {
  const [running, setRunning] = useState(true);
  const [result, setResult] = useState<KycAutoVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setRunning(true);
    setError(null);
    void runKycAutoVerification({
      idFront,
      selfie,
      domicile,
      ocrEnabled,
      existingOcr,
    })
      .then((res) => {
        setResult(res);
        onComplete(res);
      })
      .catch(() => setError(labels.autoFailed))
      .finally(() => setRunning(false));
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.05] p-3">
        <p className="gp-text text-xs font-semibold">{labels.title}</p>
        <p className="gp-muted text-[11px] mt-1 leading-relaxed">{labels.desc}</p>
      </div>

      {running && (
        <div className="flex flex-col items-center py-10 gap-3">
          <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
          <p className="gp-muted text-sm">{labels.running}</p>
        </div>
      )}

      {error && !running && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-red-300 text-sm">{error}</p>
          <button type="button" onClick={run} className="text-emerald-400 text-xs font-semibold underline">
            {labels.retry}
          </button>
        </div>
      )}

      {result && !running && (
        <div className="space-y-2">
          <div className="rounded-xl border gp-glass p-3 flex items-start gap-3">
            <ScanLine className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="gp-text text-xs font-semibold">{labels.ocrTitle}</p>
              <p className="gp-muted text-[11px] mt-0.5">
                {labels.ocrScore.replace("{score}", String(result.ocrMatchScore))}
              </p>
              {result.ocrExtract?.province && (
                <p className="gp-muted text-[10px] mt-1">{result.ocrExtract.province} · {result.ocrExtract.city ?? ""}</p>
              )}
            </div>
            {result.ocrMatchScore >= 40 ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400" />
            )}
          </div>

          <div className="rounded-xl border gp-glass p-3 flex items-start gap-3">
            <UserCheck className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="gp-text text-xs font-semibold">{labels.faceTitle}</p>
              <p className="gp-muted text-[11px] mt-0.5">
                {labels.faceScore.replace("{score}", String(result.faceMatchScore))}
              </p>
            </div>
            {result.faceMatchPassed ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400" />
            )}
          </div>

          <div className={`rounded-xl border p-3 text-[11px] leading-relaxed ${
            result.autoPassed
              ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300"
              : "border-amber-500/30 bg-amber-500/[0.06] text-amber-200"
          }`}>
            {result.autoPassed ? labels.autoPassed : labels.manualReview}
          </div>
        </div>
      )}
    </div>
  );
}
