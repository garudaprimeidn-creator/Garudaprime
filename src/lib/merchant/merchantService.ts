import { doc, getDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import type { MarketProduct } from "../../app/marketData";
import { coerceMarketCategory } from "../../app/marketData";
import { PAY_HUB } from "../payhub/payHubService";
import { normalizeProductImages } from "./productImages";
import { fetchPayLedger } from "../payhub/payLedgerService";
import { getPayHubAuthToken, isPayHubApiConfigured, linkMerchantOwner, ensurePersonalMerchantApi, lookupMerchantForPayApi } from "../payhub/payHubApi";
import type { PayScanPrefill } from "../../app/appTypes";
import type { ParsedPayQr } from "../qr/parseQrPayload";
import { extractMerchantIdFromText } from "../qr/parseQrPayload";

export type MerchantProduct = MarketProduct & {
  merchantId: string;
  published: boolean;
  description: string;
  createdAt: string;
};

export type MerchantDayStats = { gat: number; orders: number; usd: number };

export type MerchantStats = {
  marketLinked: boolean;
  daily: Record<string, MerchantDayStats>;
};

const PRODUCTS_KEY = "garuda_merchant_products";
const STATS_KEY = "garuda_merchant_stats";
const ID_KEY = "garuda_merchant_next_id";

export const MERCHANT_PRODUCT_ID_START = 10_001;
/** Merchant SKUs at/above this avoid collision with legacy seeded catalog (10001-10099). */
export const MERCHANT_PRODUCT_ID_FLOOR = 100_000;
export const MERCHANT_ID = PAY_HUB.merchantId;
export const MERCHANT_NAME = PAY_HUB.merchantName;

/** Canonical personal merchant doc id, must match server `personalMerchantIdForUid`. */
export const personalMerchantIdFromUid = (uid: string): string =>
  `GP-USR-${uid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toUpperCase()}`;

const MERCHANT_ID_RE = /^GP-(?:MRT|USR)-[A-Z0-9-]+$/i;

export const isValidMerchantId = (raw: string | null | undefined): boolean => {
  const text = raw?.trim();
  if (!text) return false;
  return MERCHANT_ID_RE.test(text.toUpperCase());
};

export const normalizeMerchantId = (raw: string | null | undefined): string | undefined => {
  const text = raw?.trim();
  if (!text) return undefined;
  const upper = text.toUpperCase();
  return MERCHANT_ID_RE.test(upper) ? upper : undefined;
};

const rankMerchantIdsForOwner = (uid: string, ids: string[]): string[] => {
  const personal = personalMerchantIdFromUid(uid);
  const unique = [...new Set(
    ids.map((id) => id.trim()).filter(Boolean).filter((id) => id !== MERCHANT_ID),
  )];

  return [
    personal,
    ...unique.filter((id) => id.startsWith("GP-USR-") && id !== personal),
    ...unique.filter((id) => !id.startsWith("GP-USR-")),
  ];
};

/** Sync canonical merchant ID, always GP-USR-* for a logged-in owner. */
export const canonicalMerchantIdForOwner = (uid: string): string =>
  personalMerchantIdFromUid(uid);

export const isPlatformMerchantId = (merchantId: string): boolean =>
  normalizeMerchantId(merchantId) === MERCHANT_ID;

/** Primary merchant for QR / receive, always personal GP-USR-* (never platform default). */
export const resolvePrimaryMerchantForOwner = async (
  uid: string,
  displayName?: string,
): Promise<{ merchantId: string; merchantName: string }> => {
  const personalId = canonicalMerchantIdForOwner(uid);
  let merchantId = personalId;
  let merchantName = displayName?.trim() || MERCHANT_NAME;

  try {
    const ensured = await ensureUserMerchant(displayName);
    const ensuredId = normalizeMerchantId(ensured?.merchant?.merchantId);
    if (ensuredId?.startsWith("GP-USR-")) {
      merchantId = ensuredId;
      merchantName = ensured?.merchant?.name?.trim() || merchantName;
    }
  } catch {
    /* offline / API unavailable, keep personalId */
  }

  const profile = await fetchMerchantProfile(merchantId);
  return {
    merchantId,
    merchantName: profile?.name?.trim() || merchantName,
  };
};

/** @deprecated Use buildMerchantPayQrPayload */
export const buildMerchantOffchainQrPayload = () =>
  buildMerchantPayQrPayload(MERCHANT_ID, MERCHANT_NAME);

/** Merchant QR, always garuda:pay with ID in path (reliable scan); vault optional in query. */
export const buildMerchantPayQrPayload = (
  merchantId: string,
  merchantName: string,
  vaultAddress?: string | null,
  amount?: string | number | null,
  invoiceId?: string | null,
  invoiceNote?: string | null,
): string => {
  const normalizedId = normalizeMerchantId(merchantId);
  if (!normalizedId) return "";

  const params = new URLSearchParams({
    token: "GAT",
    channel: "onchain",
    name: merchantName.trim() || MERCHANT_NAME,
    merchantId: normalizedId,
  });
  const vault = vaultAddress?.trim();
  if (vault && /^0x[a-fA-F0-9]{40}$/i.test(vault)) {
    params.set("vault", vault);
  }
  if (amount != null && amount !== "") {
    const parsed = typeof amount === "number" ? amount : parseFloat(String(amount).trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      params.set("amount", String(parsed));
    }
  }
  const invoice = invoiceId?.trim();
  if (invoice) params.set("invoice", invoice);
  const note = invoiceNote?.trim();
  if (note) params.set("note", note);
  return `garuda:pay:${normalizedId}?${params.toString()}`;
};

/** Receive QR, bare merchant ID when no amount (fast scan); garuda:pay when amount is set. */
export const encodeMerchantReceiveQrPayload = (
  merchantId: string,
  merchantName: string,
  requestAmount?: string,
  invoiceId?: string | null,
  invoiceNote?: string | null,
): string => {
  const normalizedId = normalizeMerchantId(merchantId);
  if (!normalizedId) return "";
  const trimmed = requestAmount?.trim();
  if (!trimmed) return normalizedId;
  const parsed = parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return normalizedId;
  return buildMerchantPayQrPayload(normalizedId, merchantName, null, parsed, invoiceId, invoiceNote);
};

/** Merchant IDs owned by the signed-in user (pay_merchants.ownerUid). Personal ID first. */
export const fetchMerchantIdsForOwner = async (uid: string): Promise<string[]> => {
  if (!isFirebaseConfigured || !db || !uid) return [];
  try {
    const { collection, query, where, getDocs } = await import("firebase/firestore");
    const snap = await getDocs(query(collection(db, "pay_merchants"), where("ownerUid", "==", uid)));
    const ids = snap.docs.map((d) => d.id);
    return rankMerchantIdsForOwner(uid, ids);
  } catch {
    return [];
  }
};

export const fetchMerchantProfile = async (merchantId = MERCHANT_ID) => {
  if (!isFirebaseConfigured || !db) return null;
  try {
    const snap = await getDoc(doc(db, "pay_merchants", merchantId));
    if (!snap.exists()) return null;
    return { merchantId, ...snap.data() } as {
      merchantId: string;
      name?: string;
      verified?: boolean;
      ownerUid?: string | null;
      gatBalance?: number;
      walletAddress?: string | null;
      businessScale?: "umi" | "regular" | null;
      shopSymbol?: string | null;
      shopLocation?: string | null;
      invoicePrefix?: string | null;
    };
  } catch {
    return null;
  }
};

/** Unified Pay Hub GAT balance (ledger + merchant pool), same source as Wallet panel. */
export const fetchMerchantPayHubBalance = async (merchantId = MERCHANT_ID): Promise<number> => {
  if (isPayHubApiConfigured()) {
    try {
      const ledger = await fetchPayLedger();
      if (ledger) return ledger.gatBalance;
    } catch {
      /* fall through */
    }
  }

  if (!isFirebaseConfigured || !db) return 0;
  try {
    const snap = await getDoc(doc(db, "pay_merchants", merchantId));
    if (!snap.exists()) return 0;
    return Number(snap.data()?.gatBalance ?? 0);
  } catch {
    return 0;
  }
};

/** Ensure personal merchant QR linked to this user's Pay Hub ledger. */
export const ensureUserMerchant = async (displayName?: string) => {
  if (!isPayHubApiConfigured()) return null;
  const token = await getPayHubAuthToken();
  if (!token) return null;
  return ensurePersonalMerchantApi(displayName);
};

/** Link merchant to logged-in user and migrate pooled balance into Pay Hub ledger. */
export const claimMerchantPayHub = async (merchantId = MERCHANT_ID) => {
  const id = normalizeMerchantId(merchantId) ?? merchantId.trim();
  if (!id.startsWith("GP-USR-")) return null;
  if (!isPayHubApiConfigured()) return null;
  const token = await getPayHubAuthToken();
  if (!token) return null;
  return linkMerchantOwner(id, token);
};

const emptyDay = (): MerchantDayStats => ({ gat: 0, orders: 0, usd: 0 });

export const todayKey = () => new Date().toISOString().slice(0, 10);

export const loadMerchantProducts = (): MerchantProduct[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY);
    return raw ? (JSON.parse(raw) as MerchantProduct[]) : [];
  } catch {
    return [];
  }
};

export const saveMerchantProducts = (products: MerchantProduct[]) => {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
};

export const loadMerchantStats = (): MerchantStats => {
  if (typeof window === "undefined") {
    return { marketLinked: false, daily: {} };
  }
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? (JSON.parse(raw) as MerchantStats) : { marketLinked: false, daily: {} };
  } catch {
    return { marketLinked: false, daily: {} };
  }
};

export const saveMerchantStats = (stats: MerchantStats) => {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
};

export const nextMerchantProductId = (): number => {
  const stored = localStorage.getItem(ID_KEY);
  const prev = stored ? parseInt(stored, 10) : 0;
  const next = Math.max(
    MERCHANT_PRODUCT_ID_FLOOR,
    prev + 1,
    MERCHANT_PRODUCT_ID_START,
    Date.now() % 1_000_000_000,
  );
  localStorage.setItem(ID_KEY, String(next + 1));
  return next;
};

export const getTodayStats = (stats: MerchantStats): MerchantDayStats =>
  stats.daily[todayKey()] ?? emptyDay();

export const getLast7Days = (stats: MerchantStats): { key: string; label: string; gat: number; orders: number }[] => {
  const days: { key: string; label: string; gat: number; orders: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const day = stats.daily[key] ?? emptyDay();
    days.push({
      key,
      label: d.toLocaleDateString(undefined, { weekday: "short" }),
      gat: day.gat,
      orders: day.orders,
    });
  }
  return days;
};

export const recordMerchantSale = (
  stats: MerchantStats,
  usdAmount: number,
  qty: number,
  gatAmount: number,
): MerchantStats => {
  const key = todayKey();
  const prev = stats.daily[key] ?? emptyDay();
  return {
    ...stats,
    daily: {
      ...stats.daily,
      [key]: {
        gat: prev.gat + gatAmount,
        orders: prev.orders + qty,
        usd: prev.usd + usdAmount,
      },
    },
  };
};

export type NewMerchantProductInput = {
  name: string;
  price: number;
  cat: string;
  imageUrls: string[];
  description: string;
  publish: boolean;
};

export type MerchantProductUpdateInput = {
  name: string;
  price: number;
  cat: string;
  imageUrls: string[];
  description: string;
  publish: boolean;
};

export const buildMerchantProduct = (
  input: NewMerchantProductInput,
  merchantId: string,
  sellerName: string,
): MerchantProduct => {
  const images = normalizeProductImages(input.imageUrls[0], input.imageUrls);
  return {
    id: nextMerchantProductId(),
    name: input.name.trim(),
    price: input.price,
    seller: sellerName.trim() || MERCHANT_NAME,
    cat: coerceMarketCategory(input.cat),
    rating: 5,
    orders: 0,
    emoji: "📦",
    imageUrl: images[0],
    imageUrls: images,
    merchantId: normalizeMerchantId(merchantId) ?? merchantId.trim().toUpperCase(),
    published: input.publish,
    description: input.description.trim(),
    createdAt: new Date().toISOString(),
  };
};

/** Re-stamp merchant-owned products that still carry the platform default ID. */
export const reconcileMerchantProductIds = (
  products: MerchantProduct[],
  ownerUid: string,
  sellerName?: string,
): MerchantProduct[] => {
  const personalId = personalMerchantIdFromUid(ownerUid);
  let changed = false;
  const next = products.map((p) => {
    if (!isMerchantProductId(p.id)) return p;
    const current = normalizeMerchantId(p.merchantId);
    if (current && current !== MERCHANT_ID) return p;
    changed = true;
    return {
      ...p,
      merchantId: personalId,
      seller: sellerName?.trim() || p.seller || MERCHANT_NAME,
    };
  });
  return changed ? next : products;
};

/** Re-stamp seller name + shop branding on all products owned by this merchant. */
export const applyMerchantBrandingToProducts = (
  products: MerchantProduct[],
  merchantId: string,
  branding: { sellerName: string; shopSymbol?: string; shopLocation?: string },
): MerchantProduct[] => {
  const id = normalizeMerchantId(merchantId) ?? merchantId.trim().toUpperCase();
  let changed = false;
  const next = products.map((p) => {
    const pid = normalizeMerchantId(p.merchantId) ?? p.merchantId?.trim().toUpperCase();
    if (pid !== id) return p;
    const seller = branding.sellerName.trim() || p.seller;
    const shopSymbol = branding.shopSymbol?.trim().toUpperCase() || undefined;
    const shopLocation = branding.shopLocation?.trim().toUpperCase() || undefined;
    if (seller === p.seller && shopSymbol === p.shopSymbol && shopLocation === p.shopLocation) return p;
    changed = true;
    return { ...p, seller, shopSymbol, shopLocation };
  });
  return changed ? next : products;
};

export const isMerchantProductId = (id: number) => id >= MERCHANT_PRODUCT_ID_START;

/** Resolve scan/paste into a locked pay target, API lookup + Firestore profile fallback. */
export const resolvePayScanPrefill = async (
  parsed: ParsedPayQr,
  rawText: string,
): Promise<PayScanPrefill | null> => {
  const qrPayload = rawText.trim();
  let merchantId = normalizeMerchantId(parsed.merchantId);
  let merchantName = parsed.merchantName?.trim();
  let recipientAddress = parsed.recipientAddress?.trim();

  if (!merchantId) {
    merchantId = extractMerchantIdFromText(qrPayload);
  }

  if (!merchantId && recipientAddress && /^0x[a-fA-F0-9]{40}$/i.test(recipientAddress)) {
    if (isPayHubApiConfigured()) {
      try {
        const hit = await lookupMerchantForPayApi({ vault: recipientAddress });
        merchantId = normalizeMerchantId(hit?.merchantId);
        merchantName = hit?.name?.trim() || merchantName;
        recipientAddress = hit?.walletAddress?.trim() || recipientAddress;
      } catch {
        /* fall through */
      }
    }
  }

  if (!merchantId) return null;

  const profilePromise = fetchMerchantProfile(merchantId);

  if (!recipientAddress && isPayHubApiConfigured()) {
    try {
      const hit = await lookupMerchantForPayApi({ merchantId });
      recipientAddress = hit?.walletAddress?.trim() || recipientAddress;
      merchantName = hit?.name?.trim() || merchantName;
    } catch {
      /* optional */
    }
  }

  const profile = await profilePromise;
  if (profile) {
    merchantName = profile.name?.trim() || merchantName;
    const vault = profile.walletAddress?.trim();
    if (vault?.startsWith("0x") && !recipientAddress) recipientAddress = vault;
  }

  return {
    merchantId,
    merchantName,
    amount: parsed.amount?.trim() || undefined,
    channel: parsed.channel ?? "onchain",
    recipientAddress: recipientAddress?.startsWith("0x") ? recipientAddress : undefined,
    qrPayload,
    invoiceId: parsed.invoiceId?.trim() || undefined,
    invoiceNote: parsed.invoiceNote?.trim() || undefined,
    shopSymbol: profile?.shopSymbol?.trim() || undefined,
    shopLocation: profile?.shopLocation?.trim() || undefined,
  };
};

/** Open Merchant Center, ensure personal merchant + vault synced to active wallet. */
export const syncOwnerMerchantSession = async (displayName?: string) => {
  if (!isPayHubApiConfigured()) return null;
  try {
    const ensured = await ensureUserMerchant(displayName);
    const merchantId = normalizeMerchantId(ensured?.merchant?.merchantId);
    if (merchantId?.startsWith("GP-USR-")) {
      await claimMerchantPayHub(merchantId);
    }
    return ensured;
  } catch {
    return null;
  }
};
