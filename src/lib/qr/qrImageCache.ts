import QRCode from "qrcode";

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

const cacheKey = (payload: string, size: number) => `${size}:${payload.trim()}`;

const QR_OPTIONS = {
  margin: 2,
  color: { dark: "#000000", light: "#ffffff" },
  errorCorrectionLevel: "M" as const,
};

/** Generate at higher resolution for sharper modules when displayed smaller. */
const renderSize = (displaySize: number) => Math.max(displaySize, 280);

/** Synchronous lookup, instant render when QR was generated before. */
export function getCachedQrDataUrl(payload: string, size: number): string | null {
  const text = payload?.trim();
  if (!text) return null;
  return cache.get(cacheKey(text, size)) ?? null;
}

/** Generate (or reuse) QR data URL. */
export async function ensureQrDataUrl(payload: string, size: number): Promise<string> {
  const text = payload.trim();
  if (!text) throw new Error("empty qr payload");

  const key = cacheKey(text, size);
  const hit = cache.get(key);
  if (hit) return hit;

  let job = pending.get(key);
  if (!job) {
    job = QRCode.toDataURL(text, { ...QR_OPTIONS, width: renderSize(size) }).then((url) => {
      cache.set(key, url);
      pending.delete(key);
      return url;
    }).catch((err) => {
      pending.delete(key);
      throw err;
    });
    pending.set(key, job);
  }
  return job;
}

/** Pre-generate QR in background so the panel opens instantly. */
export function warmQrImageCache(payload: string, size: number): void {
  const text = payload?.trim();
  if (!text || getCachedQrDataUrl(text, size)) return;
  void ensureQrDataUrl(text, size).catch(() => undefined);
}
