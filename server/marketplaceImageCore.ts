import { get, head, put } from "@vercel/blob";
import { blobToken } from "../lib/kyc-blob-storage.js";
import { personalMerchantIdForUid } from "./merchantLedgerCore.js";
import { adminDb } from "./firebaseAdmin.js";
import { verifyBearerToken } from "./payHubCore.js";

const PLATFORM_MERCHANT_ID = (
  process.env.VITE_PAY_HUB_MERCHANT_ID?.trim()
  || process.env.PAY_HUB_MERCHANT_ID?.trim()
  || "GP-MRT-2847"
).toUpperCase();

export type MarketplaceImageUploadBody = {
  productId: number;
  merchantId: string;
  index?: number;
  dataUrl: string;
};

export type MarketplaceMediaQuery = {
  merchantId?: string;
  productId?: string;
  index?: string;
};

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;

function parseDataUrl(dataUrl: string): { buffer: Buffer; mime: string; ext: string } {
  const trimmed = dataUrl?.trim() ?? "";
  if (!trimmed.startsWith("data:image/")) {
    throw new Error("Format foto produk tidak valid");
  }
  const base64 = trimmed.split(",")[1];
  if (!base64) throw new Error("Format foto produk tidak valid");
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > 520_000) {
    throw new Error("Foto produk terlalu besar, gunakan foto lebih kecil");
  }
  const mime = trimmed.match(/^data:([^;]+)/)?.[1] ?? "image/jpeg";
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return { buffer, mime, ext };
}

function marketplaceApiBase(): string {
  const fromEnv = process.env.VITE_PAY_HUB_API_URL?.trim()
    || process.env.PAY_HUB_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const origin = process.env.VITE_APP_ORIGIN?.trim() || "https://app.garudaprime.id";
  return `${origin.replace(/\/$/, "")}/api`;
}

export function marketplaceStoragePathname(
  merchantId: string,
  productId: number,
  index: number,
  ext = "jpg",
): string {
  const safeMerchant = merchantId.replace(/[^A-Z0-9-]/gi, "");
  return `marketplace/${safeMerchant}/${productId}/${index}.${ext}`;
}

export function marketplacePublicMediaUrl(
  merchantId: string,
  productId: number,
  index: number,
): string {
  const params = new URLSearchParams({
    merchantId: merchantId.trim().toUpperCase(),
    productId: String(productId),
    index: String(index),
  });
  return `${marketplaceApiBase()}/marketplace/product/media?${params.toString()}`;
}

export function isMarketplaceMediaProxyUrl(url: string): boolean {
  return url.includes("/api/marketplace/product/media?");
}

async function resolveMerchantIdForSync(uid: string, merchantId: string): Promise<string> {
  const normalized = merchantId.trim().toUpperCase();
  if (!normalized) throw new Error("merchantId wajib diisi");
  const personal = personalMerchantIdForUid(uid);
  if (normalized === personal) return personal;
  if (normalized === PLATFORM_MERCHANT_ID) return personal;

  const doc = await adminDb().collection("pay_merchants").doc(normalized).get();
  const ownerUid = doc.data()?.ownerUid?.trim();
  if (doc.exists && ownerUid === uid) return normalized;

  throw new Error("Anda tidak memiliki akses ke merchant ini");
}

export function isRemoteImageUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

async function uploadToVercelBlob(
  merchantId: string,
  productId: number,
  index: number,
  dataUrl: string,
): Promise<string> {
  const { buffer, mime, ext } = parseDataUrl(dataUrl);
  const pathname = marketplaceStoragePathname(merchantId, productId, index, ext);
  await put(pathname, buffer, {
    access: "private",
    token: blobToken(),
    contentType: mime,
    allowOverwrite: true,
    addRandomSuffix: false,
  });
  return marketplacePublicMediaUrl(merchantId, productId, index);
}

export async function uploadMarketplaceProductImageBuffer(
  merchantId: string,
  productId: number,
  index: number,
  dataUrl: string,
): Promise<string> {
  const trimmed = dataUrl?.trim() ?? "";
  if (!trimmed) throw new Error("Foto produk kosong");
  if (isRemoteImageUrl(trimmed) && !trimmed.startsWith("data:")) {
    if (isMarketplaceMediaProxyUrl(trimmed)) return trimmed;
    return trimmed;
  }
  return uploadToVercelBlob(merchantId, productId, index, trimmed);
}

async function blobExists(pathname: string): Promise<boolean> {
  try {
    await head(pathname, { token: blobToken() });
    return true;
  } catch {
    return false;
  }
}

export async function streamMarketplaceProductMedia(
  query: MarketplaceMediaQuery,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const merchantId = query.merchantId?.trim().toUpperCase() ?? "";
  const productId = Number(query.productId);
  const index = Number.isFinite(Number(query.index)) ? Number(query.index) : 0;
  if (!merchantId || !Number.isFinite(productId) || productId < 1) return null;

  const productSnap = await adminDb().collection("marketplace_products").doc(String(productId)).get();
  const product = productSnap.data();
  if (!product?.published) return null;

  for (const ext of IMAGE_EXTENSIONS) {
    const pathname = marketplaceStoragePathname(merchantId, productId, index, ext);
    if (!(await blobExists(pathname))) continue;
    const result = await get(pathname, {
      access: "private",
      token: blobToken(),
    });
    if (!result || !result.stream) continue;
    const chunks: Uint8Array[] = [];
    const reader = result.stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return {
      buffer: Buffer.concat(chunks.map((c) => Buffer.from(c))),
      contentType: result.blob.contentType ?? (ext === "png" ? "image/png" : "image/jpeg"),
    };
  }
  return null;
}

export async function handleMarketplaceImageUpload(
  authHeader: string | undefined,
  body: MarketplaceImageUploadBody,
): Promise<{ url: string }> {
  const decoded = await verifyBearerToken(authHeader);
  const merchantId = await resolveMerchantIdForSync(decoded.uid, body.merchantId?.trim() ?? "");
  const productId = Number(body.productId);
  if (!Number.isFinite(productId) || productId < 1) throw new Error("ID produk tidak valid");

  const index = Number.isFinite(body.index) ? Number(body.index) : 0;
  const url = await uploadMarketplaceProductImageBuffer(
    merchantId,
    productId,
    Math.max(0, Math.min(index, 2)),
    body.dataUrl,
  );
  return { url };
}

export function marketplaceImageErrorStatus(message: string): number {
  if (message === "Unauthorized" || message.includes("Unauthorized")) return 401;
  if (message.includes("tidak memiliki akses")) return 403;
  if (message.includes("tidak valid") || message.includes("wajib") || message.includes("kosong")) return 400;
  if (message.includes("terlalu besar")) return 413;
  if (message.includes("BLOB_READ_WRITE_TOKEN") || message.includes("belum dikonfigurasi")) return 503;
  return 500;
}
