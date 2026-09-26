import React from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { ensureQrDataUrl, getCachedQrDataUrl } from "../../lib/qr/qrImageCache";

type Props = {
  payload: string;
  size?: number;
  className?: string;
  alt?: string;
  emptyLabel?: string;
};

export const QrPayloadImage = ({
  payload,
  size = 176,
  className = "",
  alt = "QR code",
  emptyLabel = "QR tidak tersedia",
}: Props) => {
  const text = payload?.trim() ?? "";
  const [dataUrl, setDataUrl] = React.useState<string | null>(() =>
    text ? getCachedQrDataUrl(text, size) : null,
  );
  const [failed, setFailed] = React.useState(false);
  const [generating, setGenerating] = React.useState(() =>
    Boolean(text) && !getCachedQrDataUrl(text, size),
  );

  React.useEffect(() => {
    if (!text) {
      setFailed(true);
      setGenerating(false);
      return;
    }

    setFailed(false);
    const cached = getCachedQrDataUrl(text, size);
    if (cached) {
      setDataUrl(cached);
      setGenerating(false);
      return;
    }

    setGenerating(true);
    let cancelled = false;

    void ensureQrDataUrl(text, size)
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
          setGenerating(false);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setGenerating(false);
        }
      });

    return () => { cancelled = true; };
  }, [text, size]);

  if (!text || (failed && !dataUrl)) {
    return (
      <div
        className={`rounded-2xl flex flex-col items-center justify-center gap-2 bg-white text-center px-3 ${className}`}
        style={{ width: size, height: size }}
      >
        <AlertCircle className="w-7 h-7 text-amber-500" />
        <p className="text-[10px] font-medium text-zinc-600 leading-snug">{emptyLabel}</p>
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div
        className={`rounded-2xl flex items-center justify-center bg-white ${className}`}
        style={{ width: size, height: size }}
      >
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <img
        src={dataUrl}
        alt={alt}
        width={size}
        height={size}
        className={`rounded-xl object-contain bg-white ${className}`}
        style={{ width: size, height: size }}
      />
      {generating && (
        <div className="absolute inset-0 rounded-xl bg-white/40 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
        </div>
      )}
    </div>
  );
};
