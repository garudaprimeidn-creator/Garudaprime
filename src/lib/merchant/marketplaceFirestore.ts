import {
  collection, doc, getDocs, setDoc, query, where, limit,
  onSnapshot, type Unsubscribe,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import type { MarketProduct } from "../../app/marketData";
import { isDigitalMarketProduct } from "../../app/marketData";
import { MERCHANT_ID, normalizeMerchantId, isPlatformMerchantId } from "./merchantService";
import { normalizeProductImages } from "./productImages";
import { syncMarketplaceProductViaApi, mergePersistedProductImages } from "./marketplaceApi";

export type MarketplaceProductDoc = MarketProduct & {
  merchantId: string;
  published: boolean;
  description: string;
  halalVerified: boolean;
  moderationStatus: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt?: string;
};

const COL = "marketplace_products";
const LOCAL_KEY = "garuda_merchant_products";
const CATALOG_LIMIT = 300;

/** Merchant-published products go live on Market immediately (no admin queue). */
export const marketplaceDocFromMerchant = (
  product: MarketplaceProductDoc | (MarketProduct & { merchantId: string; published: boolean; description: string }),
): MarketplaceProductDoc => {
  const images = normalizeProductImages(product.imageUrl, product.imageUrls);
  return {
    ...product,
    merchantId: product.merchantId ?? "",
    description: product.description ?? "",
    imageUrl: images[0],
    imageUrls: images,
    halalVerified: true,
    moderationStatus: product.published ? "approved" : "pending",
    createdAt: product.createdAt ?? new Date().toISOString(),
  };
};

export const isVisibleOnMarketplace = (
  p: Pick<MarketplaceProductDoc, "published" | "moderationStatus">,
): boolean => {
  if (!p.published) return false;
  if (p.moderationStatus === "rejected" || p.moderationStatus === "pending") return false;
  return true;
};

const normalizeRemoteProduct = (p: MarketplaceProductDoc): MarketplaceProductDoc => {
  const images = normalizeProductImages(p.imageUrl, p.imageUrls);
  const normalized = {
    ...p,
    imageUrl: images[0],
    imageUrls: images,
  };
  return normalized.published && normalized.moderationStatus === "pending"
    ? { ...normalized, moderationStatus: "approved" as const }
    : normalized;
};

export const prepareProductForRemoteSync = (
  product: MarketplaceProductDoc,
  ownerMerchantId?: string | null,
): MarketplaceProductDoc => {
  const canonicalOwner = ownerMerchantId?.trim().toUpperCase() ?? "";
  const current = normalizeMerchantId(product.merchantId) ?? product.merchantId?.trim().toUpperCase() ?? "";
  const merchantId = canonicalOwner && (!current || current === MERCHANT_ID || isPlatformMerchantId(current))
    ? canonicalOwner
    : (current || canonicalOwner);
  return marketplaceDocFromMerchant({ ...product, merchantId });
};

const persistLocalMerchantProduct = (payload: MarketplaceProductDoc) => {
  const list = loadLocalMerchantProducts();
  const idx = list.findIndex((p) => p.id === payload.id);
  const previous = idx >= 0 ? list[idx] : undefined;
  const merged = mergePersistedProductImages(previous, payload);
  if (idx >= 0) list[idx] = merged;
  else list.push(merged);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
};

const remoteRowsToVisibleCatalog = (remote: MarketplaceProductDoc[]): MarketplaceProductDoc[] =>
  remote
    .map(normalizeRemoteProduct)
    .filter(isVisibleOnMarketplace)
    .filter(isDigitalMarketProduct);

/**
 * Firestore catalog + optimistic rows from the signed-in merchant only.
 * Other users' devices must not inject foreign localStorage into the global Market.
 */
export const mergeCatalogWithLocalMerchant = (
  remote: MarketplaceProductDoc[],
  ownerMerchantId?: string | null,
): MarketplaceProductDoc[] => {
  const merged = new Map<number, MarketplaceProductDoc>();
  for (const p of remoteRowsToVisibleCatalog(remote)) {
    merged.set(p.id, p);
  }

  const ownerKey = ownerMerchantId?.trim().toUpperCase() ?? "";
  if (!ownerKey) return [...merged.values()];

  for (const p of loadLocalMerchantProducts()) {
    const current = normalizeMerchantId(p.merchantId) ?? p.merchantId?.trim().toUpperCase() ?? "";
    const owned = current === ownerKey
      || current === MERCHANT_ID
      || isPlatformMerchantId(current);
    if (!owned) continue;

    const docRow = prepareProductForRemoteSync(p as MarketplaceProductDoc, ownerKey);
    const existing = merged.get(p.id);
    const row = existing
      ? mergePersistedProductImages(docRow, { ...docRow, ...existing })
      : docRow;
    if (isVisibleOnMarketplace(row) && isDigitalMarketProduct(row)) {
      merged.set(p.id, row);
    } else {
      merged.delete(p.id);
    }
  }

  return [...merged.values()].sort((a, b) => {
    const aTs = Date.parse(a.updatedAt ?? a.createdAt ?? "") || a.id;
    const bTs = Date.parse(b.updatedAt ?? b.createdAt ?? "") || b.id;
    return bTs - aTs;
  });
};

export const loadLocalMerchantProducts = (): MarketplaceProductDoc[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as MarketplaceProductDoc[]) : [];
  } catch {
    return [];
  }
};

const stripDataUrlsForFirestore = (payload: MarketplaceProductDoc): MarketplaceProductDoc => {
  const remoteImages = normalizeProductImages(payload.imageUrl, payload.imageUrls)
    .filter((url) => url.startsWith("http"));
  return {
    ...payload,
    imageUrl: remoteImages[0],
    imageUrls: remoteImages,
  };
};

async function writeProductToFirestore(product: MarketplaceProductDoc): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  const payload = stripDataUrlsForFirestore(marketplaceDocFromMerchant(product));
  const remoteImages = normalizeProductImages(payload.imageUrl, payload.imageUrls);
  if (remoteImages.length === 0) {
    console.warn("[marketplace] skip client Firestore write, no https image URLs yet");
    return;
  }
  await setDoc(doc(db, COL, String(product.id)), {
    ...payload,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

async function fetchRemotePublishedRows(): Promise<MarketplaceProductDoc[]> {
  if (!isFirebaseConfigured || !db) return [];
  try {
    const snap = await getDocs(
      query(
        collection(db, COL),
        where("published", "==", true),
        where("moderationStatus", "==", "approved"),
        limit(CATALOG_LIMIT),
      ),
    );
    return snap.docs.map((d) => d.data() as MarketplaceProductDoc);
  } catch {
    const snap = await getDocs(
      query(collection(db, COL), where("published", "==", true), limit(CATALOG_LIMIT)),
    );
    return snap.docs
      .map((d) => d.data() as MarketplaceProductDoc)
      .filter((p) => p.moderationStatus !== "rejected");
  }
}

export async function syncLocalProductsToFirestore(
  merchantId: string,
  products?: MarketplaceProductDoc[],
): Promise<number> {
  const local = products ?? loadLocalMerchantProducts();
  let synced = 0;
  for (const p of local) {
    const row = prepareProductForRemoteSync(
      marketplaceDocFromMerchant({
        ...p,
        merchantId: (!p.merchantId || p.merchantId === MERCHANT_ID) ? merchantId : p.merchantId,
      }),
      merchantId,
    );
    try {
      await upsertMarketplaceProduct(row, merchantId);
      synced += 1;
    } catch (err) {
      console.warn("[marketplace] resync failed for", row.id, err);
    }
  }
  return synced;
}

export async function fetchPublishedProducts(
  ownerMerchantId?: string | null,
): Promise<MarketplaceProductDoc[]> {
  try {
    const remote = await fetchRemotePublishedRows();
    return mergeCatalogWithLocalMerchant(remote, ownerMerchantId);
  } catch {
    return mergeCatalogWithLocalMerchant([], ownerMerchantId);
  }
}

export async function upsertMarketplaceProduct(
  product: MarketplaceProductDoc,
  ownerMerchantId?: string | null,
): Promise<MarketplaceProductDoc> {
  const list = loadLocalMerchantProducts();
  const previous = list.find((p) => p.id === product.id);

  const payload = prepareProductForRemoteSync(
    marketplaceDocFromMerchant(product),
    ownerMerchantId,
  );
  persistLocalMerchantProduct(payload);

  if (!isFirebaseConfigured) {
    return mergePersistedProductImages(previous, payload);
  }

  try {
    const result = await syncMarketplaceProductViaApi(payload);
    const synced = mergePersistedProductImages(payload, marketplaceDocFromMerchant({
      ...payload,
      imageUrl: result.imageUrl ?? result.imageUrls[0],
      imageUrls: result.imageUrls,
    }));
    persistLocalMerchantProduct(synced);
    return synced;
  } catch (apiErr) {
    console.warn("[marketplace] API sync failed, falling back to client Firestore", apiErr);
  }

  if (!db) return mergePersistedProductImages(previous, payload);

  try {
    await writeProductToFirestore(payload);
    return mergePersistedProductImages(previous, payload);
  } catch (err) {
    console.warn("[marketplace] client Firestore sync failed", err);
    throw err;
  }
}

export function subscribeMarketplaceProducts(
  callback: (products: MarketplaceProductDoc[]) => void,
  ownerMerchantId?: string | null,
): Unsubscribe | null {
  if (!isFirebaseConfigured || !db) {
    callback(mergeCatalogWithLocalMerchant([], ownerMerchantId));
    return null;
  }
  return onSnapshot(
    query(collection(db, COL), where("published", "==", true), limit(CATALOG_LIMIT)),
    (snap) => {
      callback(mergeCatalogWithLocalMerchant(
        snap.docs.map((d) => d.data() as MarketplaceProductDoc),
        ownerMerchantId,
      ));
    },
    (err) => {
      console.warn("[marketplace] live catalog subscription error", err);
      void fetchPublishedProducts(ownerMerchantId).then(callback);
    },
  );
}

export async function publishMerchantProductToFirestore(
  product: MarketplaceProductDoc,
  ownerMerchantId?: string | null,
): Promise<void> {
  await upsertMarketplaceProduct(marketplaceDocFromMerchant(product), ownerMerchantId);
}
