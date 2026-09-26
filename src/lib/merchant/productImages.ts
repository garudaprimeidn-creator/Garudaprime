import type { MarketProduct } from "../../app/marketData";

export const MAX_PRODUCT_IMAGES = 3;

export type ProductImageSource = Pick<MarketProduct, "imageUrl" | "imageUrls">;

/** Normalize legacy single imageUrl + imageUrls into up to 3 URLs. */
export function normalizeProductImages(
  imageUrl?: string | null,
  imageUrls?: string[] | null,
): string[] {
  const fromArray = (imageUrls ?? []).map((u) => u?.trim()).filter(Boolean) as string[];
  if (fromArray.length > 0) {
    return [...new Set(fromArray)].slice(0, MAX_PRODUCT_IMAGES);
  }
  const single = imageUrl?.trim();
  return single ? [single] : [];
}

export function getProductImages(product: ProductImageSource): string[] {
  return normalizeProductImages(product.imageUrl, product.imageUrls);
}

export function primaryProductImage(product: ProductImageSource): string | undefined {
  return getProductImages(product)[0];
}

export function withProductImages<T extends ProductImageSource>(
  product: T,
  urls: string[],
): T & { imageUrl?: string; imageUrls: string[] } {
  const normalized = normalizeProductImages(urls[0], urls);
  return {
    ...product,
    imageUrl: normalized[0],
    imageUrls: normalized,
  };
}
