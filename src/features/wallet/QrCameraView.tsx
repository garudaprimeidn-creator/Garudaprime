import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { motion } from "motion/react";
import { AlertCircle, ImagePlus, Loader2, ScanLine } from "lucide-react";
import { useQrCameraScanner, type QrCameraStatus } from "../../lib/qr/useQrCameraScanner";
import { ViewfinderCorners } from "./qrScannerUi";

export type QrCameraViewHandle = {
  openUpload: () => void;
};

type StatusLabels = Record<QrCameraStatus, string> & {
  uploadFallback: string;
  uploadHint?: string;
};

type Props = {
  active: boolean;
  cornerColor?: "amber" | "cyan" | "emerald";
  scanLineClass?: string;
  hint: string;
  statusLabels: StatusLabels;
  onDecode: (text: string) => boolean | void;
  onUploadFail?: () => void;
  onStatusChange?: (status: QrCameraStatus) => void;
  showInlineUpload?: boolean;
};

export const QrCameraView = forwardRef<QrCameraViewHandle, Props>(({
  active,
  cornerColor = "amber",
  scanLineClass = "from-transparent via-amber-400 to-transparent",
  hint,
  statusLabels,
  onDecode,
  onUploadFail,
  onStatusChange,
  showInlineUpload = true,
}, ref) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const decodedRef = useRef(false);
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  const [uploading, setUploading] = useState(false);

  const handleDecode = useCallback((text: string): boolean => {
    if (!text || decodedRef.current) return false;
    try {
      const accepted = onDecodeRef.current(text);
      if (accepted === false) return false;
      decodedRef.current = true;
      return true;
    } catch (err) {
      console.error("[Garuda Prime QR]", err);
      return false;
    }
  }, []);

  const {
    elementId,
    status,
    decodeFromImage,
    tapToFocus,
  } = useQrCameraScanner({
    active,
    onDecode: handleDecode,
    facingMode: "environment",
  });

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  useEffect(() => {
    if (!active || status !== "scanning") {
      decodedRef.current = false;
    }
  }, [active, status]);

  useImperativeHandle(ref, () => ({
    openUpload: () => fileInputRef.current?.click(),
  }), []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || decodedRef.current) return;

    setUploading(true);
    try {
      const ok = await decodeFromImage(file);
      if (!ok) onUploadFail?.();
    } catch {
      onUploadFail?.();
    } finally {
      setUploading(false);
    }
  };

  const openUpload = () => fileInputRef.current?.click();

  const showCamera = status === "scanning" || status === "starting";
  const showFallback = status === "denied" || status === "unsupported" || status === "error";
  const accentText = cornerColor === "amber"
    ? "text-amber-400"
    : cornerColor === "emerald"
      ? "text-emerald-400"
      : "text-cyan-400";
  const accentBorder = cornerColor === "amber"
    ? "border-amber-500/30 text-amber-400"
    : cornerColor === "emerald"
      ? "border-emerald-500/30 text-emerald-400"
      : "border-cyan-500/30 text-cyan-400";

  return (
    <div className="space-y-3 w-full">
      <div
        className="gp-qr-camera-viewport relative mx-auto w-full aspect-square min-h-[14rem] sm:min-h-[16rem] rounded-2xl overflow-hidden bg-black"
        onClick={showCamera ? tapToFocus : undefined}
        role={showCamera ? "button" : undefined}
        tabIndex={showCamera ? -1 : undefined}
        aria-label={showCamera ? hint : undefined}
      >
        {active && (
          <div
            id={elementId}
            className="gp-html5-qr-reader absolute inset-0 w-full h-full"
          />
        )}

        {!showCamera && !showFallback && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <ScanLine className={`w-11 h-11 opacity-25 ${accentText}`} />
          </div>
        )}

        {showFallback && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center bg-black z-20">
            <AlertCircle className={`w-8 h-8 ${accentText}`} />
            <p className="gp-muted text-[10px] leading-relaxed">
              {statusLabels[status]}
            </p>
          </div>
        )}

        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30 pointer-events-none">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 z-40">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
            <p className="text-white text-[10px] font-semibold">
              {statusLabels.uploadHint ?? "Membaca gambar QR…"}
            </p>
          </div>
        )}

        <div className="absolute inset-[10%] pointer-events-none z-10">
          <ViewfinderCorners color={cornerColor} />
        </div>

        {status === "scanning" && !uploading && (
          <motion.div
            className={`absolute left-[12%] right-[12%] h-0.5 bg-gradient-to-r ${scanLineClass} z-10 pointer-events-none`}
            animate={{ top: ["14%", "86%", "14%"] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>

      {showCamera && (
        <p className="flex items-center justify-center gap-1 gp-muted text-[10px] text-center px-2">
          {hint}
        </p>
      )}

      {showInlineUpload && (
        <button
          type="button"
          disabled={uploading}
          onClick={openUpload}
          className={`w-full py-3 rounded-2xl border flex items-center justify-center gap-2 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 gp-wallet-secondary ${accentBorder}`}
        >
          {uploading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <ImagePlus className="w-4 h-4" />}
          {statusLabels.uploadFallback}
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleFile(e)}
      />
    </div>
  );
});

QrCameraView.displayName = "QrCameraView";
