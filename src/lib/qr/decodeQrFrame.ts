import jsQR from "jsqr";

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

const DECODE_MAX_DIM = 1600;
const VIEWFINDER_INSET = 0.1;

let nativeDetector: BarcodeDetectorLike | null | undefined;

function getNativeBarcodeDetector(): BarcodeDetectorLike | null {
  if (nativeDetector !== undefined) return nativeDetector;
  const ctor = (window as Window & {
    BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
  }).BarcodeDetector;
  if (!ctor) {
    nativeDetector = null;
    return null;
  }
  try {
    nativeDetector = new ctor({ formats: ["qr_code"] });
  } catch {
    nativeDetector = null;
  }
  return nativeDetector;
}

function decodeImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  for (const inversion of ["attemptBoth", "dontInvert", "onlyInvert"] as const) {
    const result = jsQR(data, width, height, { inversionAttempts: inversion });
    if (result?.data?.trim()) return result.data.trim();
  }
  return null;
}

function decodeRegion(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): string | null {
  if (sw <= 0 || sh <= 0) return null;
  const slice = ctx.getImageData(sx, sy, sw, sh);
  return decodeImageData(slice.data, slice.width, slice.height);
}

function decodeFromCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): string | null {
  const insetX = Math.floor(width * VIEWFINDER_INSET);
  const insetY = Math.floor(height * VIEWFINDER_INSET);
  const innerW = Math.max(1, width - insetX * 2);
  const innerH = Math.max(1, height - insetY * 2);

  const regions: Array<[number, number, number, number]> = [
    [insetX, insetY, innerW, innerH],
    [0, 0, width, height],
  ];

  for (const ratio of [0.72, 0.55]) {
    const crop = Math.floor(Math.min(width, height) * ratio);
    regions.push([
      Math.floor((width - crop) / 2),
      Math.floor((height - crop) / 2),
      crop,
      crop,
    ]);
  }

  for (const [sx, sy, sw, sh] of regions) {
    const hit = decodeRegion(ctx, sx, sy, sw, sh);
    if (hit) return hit;
  }

  return null;
}

export function drawVideoToCanvas(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  maxDim = DECODE_MAX_DIM,
): { ctx: CanvasRenderingContext2D; width: number; height: number } | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw <= 0 || vh <= 0) return null;

  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  const width = Math.max(1, Math.floor(vw * scale));
  const height = Math.max(1, Math.floor(vh * scale));

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, width, height);
  return { ctx, width, height };
}

/** Fast synchronous decode, preferred on every camera frame. */
export function decodeQrFromCanvasSync(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): string | null {
  return decodeFromCanvas(ctx, width, height);
}

async function tryNativeBarcodeDetector(
  source: ImageBitmapSource,
): Promise<string | null> {
  const detector = getNativeBarcodeDetector();
  if (!detector) return null;

  try {
    const codes = await detector.detect(source);
    return codes[0]?.rawValue?.trim() ?? null;
  } catch {
    return null;
  }
}

/** Async fallback when jsQR misses (uses native BarcodeDetector when available). */
export async function decodeQrFromCanvasAsync(
  canvas: HTMLCanvasElement,
): Promise<string | null> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const sync = decodeFromCanvas(ctx, canvas.width, canvas.height);
  if (sync) return sync;

  const bitmap = await createImageBitmap(canvas);
  try {
    return await tryNativeBarcodeDetector(bitmap);
  } finally {
    bitmap.close();
  }
}

/** Decode QR from a camera video frame. */
export async function decodeQrFromVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Promise<string | null> {
  const frame = drawVideoToCanvas(video, canvas);
  if (!frame) return null;

  const sync = decodeQrFromCanvasSync(frame.ctx, frame.width, frame.height);
  if (sync) return sync;

  return decodeQrFromCanvasAsync(canvas);
}

/** Decode QR from uploaded image element. */
export async function decodeQrFromImageElement(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
): Promise<string | null> {
  const scale = Math.min(1, DECODE_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.max(1, Math.floor(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.floor(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const sync = decodeFromCanvas(ctx, canvas.width, canvas.height);
  if (sync) return sync;

  return decodeQrFromCanvasAsync(canvas);
}
