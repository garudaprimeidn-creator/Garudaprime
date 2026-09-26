/** Digital-only catalog (SidraStart: no physical goods / courier fulfillment). */
export const MARKET_CATEGORIES = [
  "Digital",
  "Education",
  "Services",
  "Vouchers",
  "Finance",
  "Health",
] as const;

export type MarketCategory = (typeof MARKET_CATEGORIES)[number];

/** Legacy physical categories previously used in Market / Firestore. */
const LEGACY_PHYSICAL_CATEGORIES = new Set([
  "Food",
  "Fashion",
  "Beauty",
  "Electronics",
  "Vehicles",
  "Property",
  "Home",
]);

export const isDigitalMarketCategory = (cat: string): cat is MarketCategory =>
  (MARKET_CATEGORIES as readonly string[]).includes(cat);

/** Hide physical / unknown legacy catalog rows from the public Market. */
export const isDigitalMarketProduct = (product: { cat: string }): boolean =>
  isDigitalMarketCategory(String(product.cat || "").trim());

export const coerceMarketCategory = (cat: string): MarketCategory => {
  const trimmed = String(cat || "").trim();
  if (isDigitalMarketCategory(trimmed)) return trimmed;
  if (LEGACY_PHYSICAL_CATEGORIES.has(trimmed)) return "Digital";
  return "Digital";
};

export type MarketProduct = {
  id: number;
  name: string;
  price: number;
  seller: string;
  cat: MarketCategory | string;
  rating: number;
  orders: number;
  emoji: string;
  imageUrl?: string;
  /** Up to 3 product photos, synced to Market & admin. */
  imageUrls?: string[];
  merchantId?: string;
  /** Merchant shop symbol (e.g. HTM), synced from Merchant Center profile */
  shopSymbol?: string;
  /** Merchant location code (e.g. JKT) */
  shopLocation?: string;
  published?: boolean;
  moderationStatus?: "pending" | "approved" | "rejected";
  description?: string;
  createdAt?: string;
};

export const PRODUCT_GRADIENTS = [
  "#0dca8215", "#f0c04015", "#6366f115", "#627eea15", "#26a17b15", "#e53e6d15",
];

/** GAT checkout discount, 0 until GAT is listed with a market price. */
export const MARKET_GAT_DISCOUNT_RATE = 0;

export const marketCartDiscountUsd = (subtotalUsd: number) =>
  subtotalUsd * MARKET_GAT_DISCOUNT_RATE;

export const marketCartTotalUsd = (subtotalUsd: number) =>
  subtotalUsd - marketCartDiscountUsd(subtotalUsd);
