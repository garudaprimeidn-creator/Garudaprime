import { isWalletDisplayName } from "../web3/walletService";

/** Keys that store per-user app state (not global catalog / UI prefs). */
export const USER_APP_DATA_KEYS = [
  "garuda_notifications",
  "garuda_invest_portfolio",
  "garuda_merchant_products",
  "garuda_merchant_stats",
  "garuda_merchant_next_id",
  "garuda_market_orders",
  "garuda_shipping_address",
  "garuda_kyc_address",
  "garuda_prime_kyc_progress",
  "garuda_prime_kyc_tier",
  "garuda_prime_kyc_status",
  "garuda_pay_receipts",
  "garuda_prime_custom_tokens",
] as const;

export const APP_DATA_VERSION = 2;
export const APP_DATA_VERSION_KEY = "garuda_app_data_version";

export function clearUserAppData() {
  if (typeof window === "undefined") return;
  for (const key of USER_APP_DATA_KEYS) {
    localStorage.removeItem(key);
  }
}

/** One-time migration: remove legacy demo data from shared localStorage. */
export function migrateToFreshUserData() {
  if (typeof window === "undefined") return;
  const current = parseInt(localStorage.getItem(APP_DATA_VERSION_KEY) || "0", 10);
  if (current >= APP_DATA_VERSION) return;
  clearUserAppData();
  localStorage.setItem(APP_DATA_VERSION_KEY, String(APP_DATA_VERSION));
}

function sessionInitKey(uid: string) {
  return `garuda_prime_session_init_${uid}`;
}

/** First session for a registered account, wipe demo data, keep market catalog. */
export function initializeNewUserSession(uid: string): boolean {
  if (typeof window === "undefined" || !uid) return false;
  const key = sessionInitKey(uid);
  if (localStorage.getItem(key)) return false;
  clearUserAppData();
  localStorage.setItem(key, "1");
  localStorage.setItem(APP_DATA_VERSION_KEY, String(APP_DATA_VERSION));
  return true;
}

export function buildReferralCode(
  fullName?: string | null,
  email?: string | null,
  uid?: string | null,
): string {
  const slugify = (value: string) =>
    value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10);

  const name = fullName?.trim() ?? "";
  if (name && !isWalletDisplayName(name)) {
    const slug = slugify(name);
    if (slug) return `GARUDA-${slug}-PRIME`;
  }
  if (email) {
    const slug = slugify(email.split("@")[0] ?? "");
    if (slug) return `GARUDA-${slug}-PRIME`;
  }
  if (uid) return `GARUDA-${slugify(uid)}-PRIME`;
  return "GARUDA-PRIME";
}
