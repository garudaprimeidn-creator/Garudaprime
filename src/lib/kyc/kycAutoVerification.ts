import { scanKtpAddressFromImage, type KtpOcrExtract } from "./ktpAddressOcr";
import type { KycAddress } from "../merchant/kycAddress";
import { buildAddressVerification } from "./addressVerification";

export type KycAutoVerifyResult = {
  ocrExtract: KtpOcrExtract | null;
  ocrMatchScore: number;
  faceMatchScore: number;
  faceMatchPassed: boolean;
  autoPassed: boolean;
};

const loadImage = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = dataUrl;
  });

/** Lightweight face-region similarity (client heuristic, not a certified biometric SDK). */
async function estimateFaceMatchScore(selfieDataUrl: string, idFrontDataUrl: string): Promise<number> {
  try {
    const [selfie, idDoc] = await Promise.all([loadImage(selfieDataUrl), loadImage(idFrontDataUrl)]);
    const sample = (img: HTMLImageElement, region: { x: number; y: number; w: number; h: number }) => {
      const canvas = document.createElement("canvas");
      const w = 48;
      const h = 48;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(
        img,
        img.width * region.x,
        img.height * region.y,
        img.width * region.w,
        img.height * region.h,
        0,
        0,
        w,
        h,
      );
      return ctx.getImageData(0, 0, w, h).data;
    };
    const selfiePx = sample(selfie, { x: 0.25, y: 0.1, w: 0.5, h: 0.55 });
    const idPx = sample(idDoc, { x: 0.55, y: 0.15, w: 0.35, h: 0.45 });
    if (!selfiePx || !idPx || selfiePx.length !== idPx.length) return 0;
    let diff = 0;
    for (let i = 0; i < selfiePx.length; i += 4) {
      diff += Math.abs(selfiePx[i]! - idPx[i]!)
        + Math.abs(selfiePx[i + 1]! - idPx[i + 1]!)
        + Math.abs(selfiePx[i + 2]! - idPx[i + 2]!);
    }
    const maxDiff = (selfiePx.length / 4) * 255 * 3;
    const similarity = 1 - diff / maxDiff;
    return Math.round(Math.max(0, Math.min(100, similarity * 100)));
  } catch {
    return 0;
  }
}

export async function runKycAutoVerification(input: {
  idFront: string | null;
  selfie: string | null;
  domicile: KycAddress;
  ocrEnabled: boolean;
  existingOcr?: KtpOcrExtract | null;
}): Promise<KycAutoVerifyResult> {
  let ocrExtract = input.existingOcr ?? null;
  if (input.ocrEnabled && input.idFront?.startsWith("data:image/")) {
    try {
      ocrExtract = await scanKtpAddressFromImage(input.idFront);
    } catch {
      ocrExtract = { rawText: "OCR failed" };
    }
  }

  const addressVerification = buildAddressVerification(input.domicile, ocrExtract, null);
  const ocrMatchScore = addressVerification.ktpOcrMatchScore;

  let faceMatchScore = 0;
  if (input.selfie?.startsWith("data:image/") && input.idFront?.startsWith("data:image/")) {
    faceMatchScore = await estimateFaceMatchScore(input.selfie, input.idFront);
  }

  const faceMatchPassed = faceMatchScore >= 45;
  const autoPassed = faceMatchPassed && (!input.ocrEnabled || ocrMatchScore >= 40);

  return {
    ocrExtract,
    ocrMatchScore,
    faceMatchScore,
    faceMatchPassed,
    autoPassed,
  };
}
