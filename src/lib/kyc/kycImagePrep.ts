export type KycImagePreset = "id-document" | "selfie";

const PRESETS: Record<KycImagePreset, { maxDim: number; quality: number; maxBytes: number }> = {
  "id-document": { maxDim: 1024, quality: 0.72, maxBytes: 320_000 },
  selfie: { maxDim: 960, quality: 0.74, maxBytes: 280_000 },
};

function estimatedBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.round((base64.length * 3) / 4);
}

function resizeToJpeg(dataUrl: string, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl.startsWith("data:image/") || typeof document === "undefined") {
      resolve(dataUrl);
      return;
    }
    // HEIC/HEIF often unsupported in canvas, skip compression, keep original
    if (/data:image\/hei[cf]/i.test(dataUrl)) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function isKycImageReadyToUpload(dataUrl: string): boolean {
  if (!dataUrl.startsWith("data:image/jpeg")) return false;
  return estimatedBytes(dataUrl) <= 550_000;
}

/** Compress KYC photos before storing or uploading, keeps OCR readable but upload-friendly. */
export async function prepareKycImageForUpload(
  dataUrl: string,
  preset: KycImagePreset = "id-document",
  aggressive = false,
  skipIfSmall = false,
): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  if (skipIfSmall && isKycImageReadyToUpload(dataUrl) && !aggressive) return dataUrl;

  const base = PRESETS[preset];
  const maxDim = aggressive ? Math.min(base.maxDim, 960) : base.maxDim;
  const maxBytes = aggressive ? Math.min(base.maxBytes, 320_000) : base.maxBytes;
  let quality = aggressive ? 0.62 : base.quality;

  let result = await resizeToJpeg(dataUrl, maxDim, quality);
  while (estimatedBytes(result) > maxBytes && quality > 0.42) {
    quality -= 0.07;
    result = await resizeToJpeg(dataUrl, maxDim, quality);
  }
  if (estimatedBytes(result) > maxBytes) {
    result = await resizeToJpeg(dataUrl, 840, 0.55);
  }
  return result;
}
