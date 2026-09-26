import type { ShippingAddress } from "./shippingAddress";
import { MERCHANT_EMAIL, SUPPORT_EMAIL } from "../app/domains";
import { MERCHANT_ID, MERCHANT_NAME } from "./merchantService";

export type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled";

export type SellerContact = {
  phone: string;
  email: string;
};

export type OrderItem = {
  productId: number;
  name: string;
  qty: number;
  priceUsd: number;
};

export type BuyerSnapshot = {
  fullName: string;
  email: string;
  phone: string;
  kycTier: number;
};

export type MarketOrder = {
  id: string;
  createdAt: string;
  merchantId: string;
  sellerName: string;
  sellerContact?: SellerContact;
  items: OrderItem[];
  buyer: BuyerSnapshot;
  shipping: ShippingAddress;
  totalUsd: number;
  totalGat: number;
  feeGat?: number;
  netGat?: number;
  checkoutRef?: string;
  status: OrderStatus;
  trackingNumber?: string;
};

const ORDERS_KEY = "garuda_market_orders";

export const loadMarketOrders = (): MarketOrder[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    return raw ? (JSON.parse(raw) as MarketOrder[]) : [];
  } catch {
    return [];
  }
};

export const saveMarketOrders = (orders: MarketOrder[]) => {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
};

export const createOrderId = () =>
  `GP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export type CreateOrderInput = {
  merchantId: string;
  sellerName: string;
  sellerContact: SellerContact;
  items: OrderItem[];
  buyer: BuyerSnapshot;
  shipping: ShippingAddress;
  totalUsd: number;
  totalGat: number;
  feeGat?: number;
  netGat?: number;
  checkoutRef?: string;
};

export const createMarketOrder = (input: CreateOrderInput): MarketOrder => ({
  id: createOrderId(),
  createdAt: new Date().toISOString(),
  merchantId: input.merchantId,
  sellerName: input.sellerName,
  sellerContact: input.sellerContact,
  items: input.items,
  buyer: input.buyer,
  shipping: input.shipping,
  totalUsd: input.totalUsd,
  totalGat: input.totalGat,
  feeGat: input.feeGat,
  netGat: input.netGat,
  checkoutRef: input.checkoutRef,
  status: "pending",
});

export const appendMarketOrder = (order: MarketOrder): MarketOrder[] => {
  const orders = loadMarketOrders();
  const next = [order, ...orders];
  saveMarketOrders(next);
  return next;
};

export const updateMarketOrderStatus = (
  orders: MarketOrder[],
  orderId: string,
  status: OrderStatus,
  trackingNumber?: string,
): MarketOrder[] => {
  const next = orders.map((o) =>
    o.id === orderId
      ? { ...o, status, ...(trackingNumber !== undefined ? { trackingNumber } : {}) }
      : o,
  );
  saveMarketOrders(next);
  return next;
};

export const getMerchantOrders = (orders: MarketOrder[], merchantId = MERCHANT_ID) =>
  orders.filter((o) => o.merchantId === merchantId);

const normalizePhone = (p: string) => p.replace(/\D/g, "");

export const resolveSellerContact = (merchantId: string): SellerContact => {
  if (merchantId === MERCHANT_ID) {
    return {
      phone: import.meta.env.VITE_MERCHANT_SUPPORT_PHONE || "+62 812-3456-7890",
      email: import.meta.env.VITE_MERCHANT_SUPPORT_EMAIL || MERCHANT_EMAIL,
    };
  }
  return {
    phone: import.meta.env.VITE_MARKET_SUPPORT_PHONE || "+62 812-3456-7890",
    email: import.meta.env.VITE_MARKET_SUPPORT_EMAIL || SUPPORT_EMAIL,
  };
};

export const getOrderSellerContact = (order: MarketOrder): SellerContact =>
  order.sellerContact ?? resolveSellerContact(order.merchantId);

export const getBuyerOrders = (
  orders: MarketOrder[],
  buyer: { email?: string; phone?: string },
) => {
  const email = buyer.email?.trim().toLowerCase();
  const phone = buyer.phone ? normalizePhone(buyer.phone) : "";
  return orders.filter((o) => {
    if (email && o.buyer.email?.trim().toLowerCase() === email) return true;
    if (phone && normalizePhone(o.buyer.phone) === phone) return true;
    return false;
  });
};

export const cancelMarketOrder = (orders: MarketOrder[], orderId: string): MarketOrder[] => {
  const next = orders.map((o) =>
    o.id === orderId && o.status === "pending" ? { ...o, status: "cancelled" as const } : o,
  );
  saveMarketOrders(next);
  return next;
};

export const buildWhatsAppLink = (phone: string, message: string) => {
  const digits = normalizePhone(phone);
  const intl = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
};

export const buildTrackingUrl = (trackingNumber: string): string | null => {
  const value = trackingNumber.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return null;
};

export const orderStatusProgress = (status: OrderStatus): number => {
  switch (status) {
    case "pending": return 0;
    case "processing": return 1;
    case "shipped": return 2;
    case "delivered": return 3;
    case "cancelled": return -1;
    default: return 0;
  }
};

export const resolveSellerKey = (product: {
  merchantId?: string;
  seller: string;
}) => product.merchantId ?? `seller:${product.seller}`;

export const resolveSellerName = (product: { merchantId?: string; seller: string }) =>
  product.merchantId && product.merchantId !== MERCHANT_ID
    ? product.seller
    : MERCHANT_NAME;

export const resolveMerchantId = (product: { merchantId?: string; seller: string; id?: number }) =>
  product.merchantId ?? MERCHANT_ID;

/** Resolve merchant ID for market checkout, prefer catalog, fix platform default on merchant products. */
export const resolveCheckoutMerchantId = (
  product: { id: number; merchantId?: string; seller: string },
  catalogMerchantProducts: { id: number; merchantId?: string }[],
): string => {
  const fromCatalog = product.merchantId?.trim();
  if (fromCatalog && fromCatalog !== MERCHANT_ID) return fromCatalog.toUpperCase();
  const owned = catalogMerchantProducts.find((p) => p.id === product.id);
  if (owned?.merchantId && owned.merchantId !== MERCHANT_ID) {
    return owned.merchantId.toUpperCase();
  }
  return resolveMerchantId(product);
};
