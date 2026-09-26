export const MERCHANT_PROFILE_SAVED_EVENT = "gp-merchant-profile-saved";

export type MerchantProfileSavedDetail = {
  merchantId: string;
  name?: string;
  shopSymbol?: string | null;
  shopLocation?: string | null;
  invoicePrefix?: string | null;
};

export function emitMerchantProfileSaved(detail: MerchantProfileSavedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MERCHANT_PROFILE_SAVED_EVENT, { detail }));
}
