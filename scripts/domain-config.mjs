/**
 * Canonical Garuda Prime production domains (single source of truth).
 * Cloud project IDs come from environment variables; do not hardcode vendor accounts here.
 */
export const DOMAIN_ROOT = "garudaprime.id";

export const OFFICIAL_WEB_URL = `https://${DOMAIN_ROOT}`;
export const APP_ORIGIN = `https://app.${DOMAIN_ROOT}`;
export const ADMIN_ORIGIN = `https://admin.${DOMAIN_ROOT}`;

const firebaseProjectId = (
  process.env.VITE_FIREBASE_PROJECT_ID
  || process.env.FIREBASE_PROJECT_ID
  || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  || ""
).trim();

/** Default auth host derived from project id when set in env */
export const FIREBASE_DEFAULT_AUTH_DOMAIN = firebaseProjectId
  ? `${firebaseProjectId}.firebaseapp.com`
  : "";
/** Custom domain for OAuth branding */
export const FIREBASE_AUTH_DOMAIN_CUSTOM = `app.${DOMAIN_ROOT}`;
/** Active authDomain in client SDK (must match OAuth redirect URIs) */
export const FIREBASE_AUTH_DOMAIN = FIREBASE_AUTH_DOMAIN_CUSTOM;
export const FIREBASE_AUTH_PROXY_TARGET = FIREBASE_DEFAULT_AUTH_DOMAIN
  ? `https://${FIREBASE_DEFAULT_AUTH_DOMAIN}`
  : "";

export const APP_API_URL = `${APP_ORIGIN}/api`;
export const APP_GARUDA_RPC_URL = `${APP_ORIGIN}/api/garuda/rpc`;
export const APP_KYCPORT_CALLBACK = `${APP_ORIGIN}/auth/kycport/callback`;

/** KYC OAuth partner identifiers for Garuda Prime */
export const KYCPORT_APP_NAME = "Garuda Prime";
export const KYCPORT_PARTNER_ID = "garudaprime";
export const KYCPORT_CHAIN_ID = "974540";
export const KYCPORT_NETWORK = "Garuda Prime";

export const SUPPORT_EMAIL = `support@${DOMAIN_ROOT}`;
export const MERCHANT_EMAIL = `merchant@${DOMAIN_ROOT}`;
export const ADMIN_EMAIL = `admin@${DOMAIN_ROOT}`;

export const FIREBASE_AUTH_DOMAINS = [
  "localhost",
  "127.0.0.1",
  DOMAIN_ROOT,
  `www.${DOMAIN_ROOT}`,
  `app.${DOMAIN_ROOT}`,
  `admin.${DOMAIN_ROOT}`,
  ...(FIREBASE_DEFAULT_AUTH_DOMAIN
    ? [FIREBASE_DEFAULT_AUTH_DOMAIN, `${firebaseProjectId}.web.app`]
    : []),
];
