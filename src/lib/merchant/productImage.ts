const MAX_W = 480;
const MAX_H = 360;
const JPEG_QUALITY = 0.82;
const MAX_BYTES = 280_000;

export const PRODUCT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export async function processProductImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("invalid_type");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("too_large");
  }

  const dataUrl = await readFile(file);
  const img = await loadImage(dataUrl);
  const { width, height } = fitSize(img.width, img.height, MAX_W, MAX_H);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, 0, 0, width, height);

  let quality = JPEG_QUALITY;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > MAX_BYTES * 1.37 && quality > 0.45) {
    quality -= 0.08;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  return out;
}

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode"));
    img.src = src;
  });

const fitSize = (w: number, h: number, maxW: number, maxH: number) => {
  const ratio = Math.min(maxW / w, maxH / h, 1);
  return {
    width: Math.max(1, Math.round(w * ratio)),
    height: Math.max(1, Math.round(h * ratio)),
  };
};
