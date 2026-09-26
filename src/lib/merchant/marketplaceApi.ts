import { waitForAuthUser } from "../firebase/waitForAuthUser";
import type { MarketplaceProductDoc } from "./marketplaceFirestore";
import { normalizeProductImages } from "./productImages";
import { MAX_PRODUCT_IMAGES } from "./productImages";

const API_BASE = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "") ?? "";

function apiPath(path: string): string {
  if (API_BASE) return `${API_BASE}/${path.replace(/^\//, "")}`;
  return `/api/${path.replace(/^\//, "")}`;
}

export type MarketplaceSyncResult = {
  ok: true;
  imageUrls: string[];
  imageUrl?: string;
};

async function authHeaders(): Promise<HeadersInit> {
  const user = await waitForAuthUser();
  const token = await user.getIdToken(true);
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function uploadMarketplaceProductImageViaApi(input: {
  productId: number;
  merchantId: string;
  index: number;
  dataUrl: string;
}): Promise<string> {
  const headers = await authHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  try {
    const res = await fetch(apiPath("marketplace/product/image"), {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    const payload = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !payload.url) {
      throw new Error(payload.error ?? `Upload foto gagal (${res.status})`);
    }
    return payload.url;
  } finally {
    clearTimeout(timer);
  }
}

/** Upload base64 photos one-by-one, then return product with https URLs only. */
export async function ensureMarketplaceProductRemoteImages(
  product: MarketplaceProductDoc,
): Promise<MarketplaceProductDoc> {
  const sources = normalizeProductImages(product.imageUrl, product.imageUrls);
  if (sources.length === 0) return product;

  const remote = sources.filter((u) => u.startsWith("http"));
  const pending = sources.filter((u) => u.startsWith("data:image/"));
  if (pending.length === 0) {
    return { ...product, imageUrl: remote[0], imageUrls: remote.slice(0, MAX_PRODUCT_IMAGES) };
  }

  const uploaded = [...remote];
  for (let i = 0; i < pending.length && uploaded.length < MAX_PRODUCT_IMAGES; i += 1) {
    const url = await uploadMarketplaceProductImageViaApi({
      productId: product.id,
      merchantId: product.merchantId,
      index: uploaded.length,
      dataUrl: pending[i],
    });
    uploaded.push(url);
  }

  return {
    ...product,
    imageUrl: uploaded[0],
    imageUrls: uploaded.slice(0, MAX_PRODUCT_IMAGES),
  };
}

export async function syncMarketplaceProductViaApi(
  product: MarketplaceProductDoc,
): Promise<MarketplaceSyncResult> {
  const withImages = await ensureMarketplaceProductRemoteImages(product);
  const headers = await authHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);

  try {
    const res = await fetch(apiPath("marketplace/product/sync"), {
      method: "POST",
      headers,
      body: JSON.stringify(withImages),
      signal: controller.signal,
    });

    const payload = (await res.json().catch(() => ({}))) as MarketplaceSyncResult & { error?: string };
    if (!res.ok || !payload.ok) {
      throw new Error(payload.error ?? `Sync marketplace gagal (${res.status})`);
    }
    return payload;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Sync marketplace timeout, coba lagi");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function mergePersistedProductImages(
  previous: MarketplaceProductDoc | undefined,
  next: MarketplaceProductDoc,
): MarketplaceProductDoc {
  const nextImages = normalizeProductImages(next.imageUrl, next.imageUrls);
  if (nextImages.length > 0) {
    return { ...next, imageUrl: nextImages[0], imageUrls: nextImages };
  }
  if (!previous) return next;
  const prevImages = normalizeProductImages(previous.imageUrl, previous.imageUrls);
  if (prevImages.length === 0) return next;
  return { ...next, imageUrl: prevImages[0], imageUrls: prevImages };
}
