/** Shared merchant branding labels for Market, Pay, and transaction UI. */

export type MerchantBranding = {
  name?: string;
  merchantId?: string;
  shopSymbol?: string | null;
  shopLocation?: string | null;
};

export function formatMerchantShopTag(branding: Pick<MerchantBranding, "shopSymbol" | "shopLocation">): string {
  const sym = branding.shopSymbol?.trim();
  const loc = branding.shopLocation?.trim();
  if (sym && loc) return `${sym} · ${loc}`;
  if (sym) return sym;
  if (loc) return loc;
  return "";
}

export function formatMerchantCardSubtitle(branding: MerchantBranding): string {
  const tag = formatMerchantShopTag(branding);
  const id = branding.merchantId?.trim();
  return [tag, id].filter(Boolean).join(" · ");
}

export function formatMerchantSellerLine(
  branding: MerchantBranding & { seller?: string },
): string {
  const name = branding.seller?.trim() || branding.name?.trim();
  const tag = formatMerchantShopTag(branding);
  const parts = [name, tag].filter(Boolean);
  return parts.join(" · ");
}
