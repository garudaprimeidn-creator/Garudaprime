export type ShippingAddress = {
  recipientName: string;
  phone: string;
  /** Digital delivery inbox (voucher, license, access link). */
  email: string;
  notes: string;
  /** Legacy physical fields kept for old saved profiles / orders. */
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
};

const STORAGE_KEY = "garuda_shipping_address";

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const emptyShippingAddress = (): ShippingAddress => ({
  recipientName: "",
  phone: "",
  email: "",
  notes: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  province: "",
  postalCode: "",
});

const normalizeShipping = (raw: Partial<ShippingAddress> | null | undefined): ShippingAddress => {
  const base = { ...emptyShippingAddress(), ...(raw ?? {}) };
  const email = (base.email || "").trim()
    || (looksLikeEmail(base.addressLine1) ? base.addressLine1.trim() : "");
  return { ...base, email };
};

export type ShippingSources = {
  profileName: string;
  profilePhone: string;
  profileEmail?: string;
  savedShipping?: ShippingAddress | null;
};

/** Merge saved digital delivery contact with profile identity. */
export const buildShippingFromSources = ({
  profileName,
  profilePhone,
  profileEmail = "",
  savedShipping,
}: ShippingSources): ShippingAddress => {
  const base = normalizeShipping(savedShipping);
  return {
    ...base,
    recipientName: base.recipientName.trim() || profileName,
    phone: base.phone.trim() || profilePhone,
    email: base.email.trim() || profileEmail.trim(),
  };
};

export const missingShippingFields = (addr: ShippingAddress): (keyof ShippingAddress)[] => {
  const missing: (keyof ShippingAddress)[] = [];
  if (!addr.recipientName.trim()) missing.push("recipientName");
  if (!addr.phone.trim()) missing.push("phone");
  if (!addr.email.trim() || !looksLikeEmail(addr.email)) missing.push("email");
  return missing;
};

export const loadShippingAddress = (): ShippingAddress | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeShipping(JSON.parse(raw) as Partial<ShippingAddress>) : null;
  } catch {
    return null;
  }
};

export const saveShippingAddress = (addr: ShippingAddress) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeShipping(addr)));
};

export const isShippingAddressComplete = (addr: ShippingAddress) =>
  missingShippingFields(addr).length === 0;

export const formatShippingAddress = (addr: ShippingAddress) => {
  const email = addr.email.trim() || (looksLikeEmail(addr.addressLine1) ? addr.addressLine1.trim() : "");
  return email || "-";
};
