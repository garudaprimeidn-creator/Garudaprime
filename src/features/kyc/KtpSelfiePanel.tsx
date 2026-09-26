import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle, AlertCircle, RotateCcw, Loader2 } from "lucide-react";
import { prepareKycImageForUpload } from "../../lib/kyc/kycImagePrep";
import {
  attachStreamToVideo,
  preferNativeKycCapture,
  requestSelfieMediaStream,
} from "../../lib/kyc/kycCaptureUtils";

export type KtpSelfieLabels = {
  selfieFrontTitle: string;
  selfieBackTitle: string;
  selfieHint: string;
  takePhoto: string;
  retakePhoto: string;
  captureError: string;
  permissionDenied: string;
  selfieComplete: string;
  uploadHint: string;
  cancel: string;
  preparingPhoto: string;
};

type Slot = "front" | "back";

type Props = {
  frontCapture: string | null;
  backCapture: string | null;
  requireBack?: boolean;
  labels: KtpSelfieLabels;
  onFrontCapture: (dataUrl: string) => void;
  onBackCapture: (dataUrl: string) => void;
};

export const KtpSelfiePanel = ({
  frontCapture,
  backCapture,
  requireBack = true,
  labels,
  onFrontCapture,
  onBackCapture,
}: Props) => {
  const [activeSlot, setActiveSlot] = useState<Slot | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const useNativeCapture = preferNativeKycCapture();

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
    setCameraStarting(false);
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  useEffect(() => {
    if (!activeSlot || useNativeCapture) return;

    let cancelled = false;

    const bootCamera = async () => {
      setErrorMsg(null);
      setCameraStarting(true);
      setCameraReady(false);
      stopStream();

      try {
        const stream = await requestSelfieMediaStream();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const attach = async (attempt = 0): Promise<void> => {
          if (cancelled) return;
          const video = videoRef.current;
          if (!video) {
            if (attempt < 30) {
              window.setTimeout(() => void attach(attempt + 1), 50);
              return;
            }
            throw new Error("Video element not ready");
          }
          const ok = await attachStreamToVideo(video, stream);
          if (!ok) throw new Error("Camera preview failed");
          setCameraReady(true);
          setCameraStarting(false);
        };

        await attach();
      } catch (err) {
        if (cancelled) return;
        stopStream();
        setActiveSlot(null);
        const denied = err instanceof DOMException && (
          err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
        );
        setErrorMsg(denied ? labels.permissionDenied : labels.captureError);
      }
    };

    void bootCamera();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [activeSlot, useNativeCapture, labels, stopStream]);

  const deliverCapture = useCallback(async (slot: Slot, dataUrl: string) => {
    setPreparing(true);
    setErrorMsg(null);
    try {
      const compressed = await prepareKycImageForUpload(dataUrl, "selfie");
      if (slot === "front") onFrontCapture(compressed);
      else onBackCapture(compressed);
    } catch {
      if (slot === "front") onFrontCapture(dataUrl);
      else onBackCapture(dataUrl);
    } finally {
      setPreparing(false);
    }
  }, [onFrontCapture, onBackCapture]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || !activeSlot) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopStream();
    const slot = activeSlot;
    setActiveSlot(null);
    void deliverCapture(slot, dataUrl);
  }, [activeSlot, stopStream, deliverCapture]);

  const handleFile = (slot: Slot, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMsg(labels.captureError);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        setErrorMsg(labels.captureError);
        return;
      }
      void deliverCapture(slot, result);
    };
    reader.onerror = () => setErrorMsg(labels.captureError);
    reader.readAsDataURL(file);
  };

  const beginInAppCamera = (slot: Slot) => {
    setErrorMsg(null);
    stopStream();
    setActiveSlot(slot);
  };

  const slots: { slot: Slot; capture: string | null; title: string }[] = [
    { slot: "front", capture: frontCapture, title: labels.selfieFrontTitle },
    ...(requireBack ? [{ slot: "back" as Slot, capture: backCapture, title: labels.selfieBackTitle }] : []),
  ];

  if (activeSlot && !useNativeCapture) {
    const title = activeSlot === "front" ? labels.selfieFrontTitle : labels.selfieBackTitle;
    return (
      <div className="flex flex-col items-center py-2">
        <p className="gp-text text-xs font-semibold mb-3">{title}</p>
        <div className="relative w-full max-w-xs aspect-[3/4] mb-4 rounded-2xl overflow-hidden bg-black/40 border-2 border-emerald-500/40">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
          />
          {cameraStarting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
          )}
        </div>
        <p className="gp-muted text-[11px] text-center mb-4 px-4 leading-relaxed">{labels.selfieHint}</p>
        {errorMsg && (
          <div className="flex items-start gap-2 text-red-400 text-[11px] px-2 mb-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { stopStream(); setActiveSlot(null); }}
            className="px-4 py-2.5 rounded-xl gp-subtle gp-text text-sm"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            disabled={!cameraReady}
            onClick={capturePhoto}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm disabled:opacity-50"
          >
            <Camera className="w-4 h-4" />
            {labels.takePhoto}
          </button>
        </div>
      </div>
    );
  }

  const complete = requireBack ? !!frontCapture && !!backCapture : !!frontCapture;

  return (
    <div className="space-y-4">
      <p className="gp-muted text-[11px] text-center px-2 leading-relaxed">{labels.selfieHint}</p>

      {preparing && (
        <div className="flex items-center justify-center gap-2 text-emerald-400 text-[11px]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{labels.preparingPhoto}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-start gap-2 text-red-400 text-[11px] px-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {slots.map(({ slot, capture, title }) => (
          <div
            key={slot}
            className={`rounded-xl border-2 p-3 ${
              capture ? "border-emerald-500/40 bg-emerald-500/[0.05]" : "gp-divider gp-subtle"
            }`}
          >
            <p className="gp-text text-xs font-semibold mb-2">{title}</p>
            {capture ? (
              <>
                <img src={capture} alt={title} className="w-full aspect-[3/4] object-cover rounded-lg mb-2" />
                {useNativeCapture ? (
                  <label className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold cursor-pointer">
                    <RotateCcw className="w-3.5 h-3.5" />
                    {labels.retakePhoto}
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      className="hidden"
                      onChange={(e) => handleFile(slot, e)}
                    />
                  </label>
                ) : (
                  <button
                    type="button"
                    onClick={() => beginInAppCamera(slot)}
                    className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {labels.retakePhoto}
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="aspect-[3/4] rounded-lg gp-subtle flex items-center justify-center mb-2">
                  <Camera className="w-10 h-10 gp-muted" />
                </div>
                {useNativeCapture ? (
                  <label className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-xs mb-2 cursor-pointer">
                    <Camera className="w-3.5 h-3.5" />
                    {labels.takePhoto}
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      className="hidden"
                      onChange={(e) => handleFile(slot, e)}
                    />
                  </label>
                ) : (
                  <button
                    type="button"
                    onClick={() => beginInAppCamera(slot)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-xs mb-2"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {labels.takePhoto}
                  </button>
                )}
                <label className="block cursor-pointer text-center">
                  <span className="gp-muted text-[10px] underline">{labels.uploadHint}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFile(slot, e)}
                  />
                </label>
              </>
            )}
          </div>
        ))}
      </div>

      {complete && (
        <div className="flex items-center justify-center gap-2 text-emerald-400 pt-1">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-semibold">{labels.selfieComplete}</span>
        </div>
      )}
    </div>
  );
};
