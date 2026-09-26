export type MerchantQrSnapshot = {
  uid: string;
  merchantId: string;
  merchantName: string;
  shopSymbol?: string;
  shopLocation?: string;
  savedAt: number;
};

const CACHE_KEY = "gp_merchant_qr_snapshot_v1";

export function readMerchantQrSnapshot(uid: string): MerchantQrSnapshot | null {
  if (!uid) return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MerchantQrSnapshot;
    if (parsed.uid !== uid) return null;
    if (!parsed.merchantId?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeMerchantQrSnapshot(snapshot: MerchantQrSnapshot): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}
