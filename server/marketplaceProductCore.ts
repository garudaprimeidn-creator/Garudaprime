import { adminDb } from "./firebaseAdmin.js";
import { verifyBearerToken } from "./payHubCore.js";
import { uploadMarketplaceProductImageBuffer } from "./marketplaceImageCore.js";
import { personalMerchantIdForUid } from "./merchantLedgerCore.js";

const COL = "marketplace_products";
const MAX_IMAGES = 3;
const PLATFORM_MERCHANT_ID = (
  process.env.VITE_PAY_HUB_MERCHANT_ID?.trim()
  || process.env.PAY_HUB_MERCHANT_ID?.trim()
  || "GP-MRT-2847"
).toUpperCase();

export type MarketplaceProductPayload = {
  id: number;
  name: string;
  price: number;
  seller: string;
  cat: string;
  rating?: number;
  orders?: number;
  emoji?: string;
  imageUrl?: string;
  imageUrls?: string[];
  merchantId: string;
  published: boolean;
  description?: string;
  createdAt?: string;
};

const DIGITAL_CATEGORIES = new Set([
  "Digital",
  "Education",
  "Services",
  "Vouchers",
  "Finance",
  "Health",
]);

function coerceDigitalCategory(cat: string): string {
  const trimmed = String(cat || "").trim();
  if (DIGITAL_CATEGORIES.has(trimmed)) return trimmed;
  return "Digital";
}

async function assertMerchantOwner(uid: string, merchantId: string): Promise<string> {
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

function isRemoteImageUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function normalizeStoredImages(data: Record<string, unknown> | undefined): string[] {
  if (!data) return [];
  const fromArray = Array.isArray(data.imageUrls)
    ? data.imageUrls.map((u: unknown) => String(u ?? "").trim()).filter(Boolean)
    : [];
  if (fromArray.length > 0) return fromArray.slice(0, MAX_IMAGES);
  const single = String(data.imageUrl ?? "").trim();
  return single ? [single] : [];
}

async function resolveProductImages(
  merchantId: string,
  productId: number,
  product: MarketplaceProductPayload,
): Promise<string[]> {
  const existingSnap = await adminDb().collection(COL).doc(String(productId)).get();
  const existingImages = normalizeStoredImages(existingSnap.data());

  const raw = (product.imageUrls?.length
    ? product.imageUrls
    : (product.imageUrl ? [product.imageUrl] : []))
    .map((u) => u?.trim())
    .filter(Boolean) as string[];

  const resolved: string[] = [];
  for (let i = 0; i < Math.min(raw.length, MAX_IMAGES); i += 1) {
    const source = raw[i];
    if (isRemoteImageUrl(source) && !source.startsWith("data:")) {
      resolved.push(source);
      continue;
    }
    if (source.startsWith("data:image/")) {
      try {
        const url = await uploadMarketplaceProductImageBuffer(merchantId, productId, i, source);
        if (url) resolved.push(url);
      } catch (err) {
        console.warn("[marketplace] image upload failed", i, err);
        if (existingImages[i]) resolved.push(existingImages[i]);
      }
      continue;
    }
    if (existingImages[i]) resolved.push(existingImages[i]);
  }

  if (resolved.length === 0 && existingImages.length > 0) {
    return existingImages.slice(0, MAX_IMAGES);
  }
  return resolved.slice(0, MAX_IMAGES);
}

export async function syncMarketplaceProductAdmin(
  authHeader: string | undefined,
  product: MarketplaceProductPayload,
): Promise<{ ok: true; imageUrls: string[]; imageUrl?: string }> {
  const decoded = await verifyBearerToken(authHeader);
  const uid = decoded.uid;

  const merchantId = await assertMerchantOwner(uid, product.merchantId?.trim() ?? "");

  const id = Number(product.id);
  if (!Number.isFinite(id) || id < 1) throw new Error("ID produk tidak valid");

  const imageUrls = await resolveProductImages(merchantId, id, product);
  if (product.published && imageUrls.length === 0) {
    throw new Error("Foto produk gagal diunggah, coba simpan ulang dengan koneksi stabil");
  }

  const now = new Date().toISOString();
  const published = Boolean(product.published);

  const doc = {
    id,
    name: product.name?.trim() ?? "",
    price: Number(product.price) || 0,
    seller: product.seller?.trim() ?? "",
    cat: coerceDigitalCategory(product.cat ?? ""),
    rating: Number(product.rating) || 5,
    orders: Number(product.orders) || 0,
    emoji: product.emoji ?? "📦",
    imageUrl: imageUrls[0] ?? "",
    imageUrls,
    merchantId,
    published,
    description: product.description?.trim() ?? "",
    halalVerified: true,
    moderationStatus: published ? "approved" : "pending",
    createdAt: product.createdAt ?? now,
    updatedAt: now,
    ownerUid: uid,
  };

  await adminDb().collection(COL).doc(String(id)).set(doc, { merge: true });
  return { ok: true, imageUrls, imageUrl: imageUrls[0] };
}

export function marketplaceSyncErrorStatus(message: string): number {
  if (message === "Unauthorized" || message.includes("Unauthorized")) return 401;
  if (message.includes("tidak memiliki akses") || message.includes("Forbidden")) return 403;
  if (message.includes("tidak valid") || message.includes("wajib")) return 400;
  if (message.includes("terlalu besar") || message.includes("gagal diunggah")) return 413;
  if (message.includes("BLOB_READ_WRITE_TOKEN") || message.includes("belum dikonfigurasi")) return 503;
  return 500;
}
