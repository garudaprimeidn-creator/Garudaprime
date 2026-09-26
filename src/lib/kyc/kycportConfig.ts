/** KYCPORT 2.0, OIDC on www.kycport.com · docs: https://www.kycport.com/docs */

import { getKycPortCallbackUri } from "./kycportOAuthFlow";

export type KycPortConfig = {
  apiBaseUrl: string;
  /** OIDC authorize, https://www.kycport.com/authorize */
  authorizeUrl: string;
  loginUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
  chainId: number;
  network: string;
  appName: string;
  appOrigin: string;
  partnerId: string;
  paths: {
    health: string;
    oidcToken: string;
    oidcUserinfo: string;
    /** Hosted verification for signed-in users */
    verifyWeb: string;
  };
};

const trimSlash = (url: string) => url.replace(/\/+$/, "");
const ensureSlash = (path: string) => (path.endsWith("/") ? path : `${path}/`);

const DEFAULT_API = "https://www.kycport.com/api";
const DEFAULT_AUTHORIZE = "https://www.kycport.com/authorize";
const DEFAULT_PORTAL_WEB = "https://www.kycport.com";
const DEFAULT_SCOPES = "openid email kyc";
/** Production callback, must match KYCport console exactly (HTTPS, no trailing slash). */
export const DEFAULT_KYCPORT_REDIRECT_URI = "https://app.garudaprime.id/auth/kycport/callback";

let redirectUriCache: { uri: string; at: number } | null = null;

/** Canonical redirect URI, production always uses app.garudaprime.id (KYCPort console registration). */
export const getKycPortCanonicalRedirectUri = (): string => {
  const fromEnv = import.meta.env.VITE_KYCPORT_REDIRECT_URI?.trim();
  if (fromEnv) return trimSlash(fromEnv);
  if (import.meta.env.PROD) return DEFAULT_KYCPORT_REDIRECT_URI;
  const appOrigin = import.meta.env.VITE_APP_ORIGIN?.trim();
  if (appOrigin) return `${trimSlash(appOrigin)}/auth/kycport/callback`;
  return "";
};

export const getKycPortRedirectUri = (): string => {
  const canonical = getKycPortCanonicalRedirectUri();
  if (canonical) return canonical;
  if (typeof window !== "undefined" && !import.meta.env.PROD) {
    return getKycPortCallbackUri();
  }
  return DEFAULT_KYCPORT_REDIRECT_URI;
};

/** Server SSO config is source of truth (matches KYCport console registration). */
export const resolveKycPortRedirectUri = async (): Promise<string> => {
  const canonical = getKycPortRedirectUri();
  const base = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");
  if (!base) return canonical;

  if (redirectUriCache && Date.now() - redirectUriCache.at < 60_000) {
    return redirectUriCache.uri;
  }

  try {
    const res = await fetch(`${base}/kycport/sso/config`, { cache: "no-store" });
    if (res.ok) {
      const body = await res.json() as { redirectUri?: string };
      const fromServer = body.redirectUri?.trim();
      if (fromServer) {
        const uri = trimSlash(fromServer);
        redirectUriCache = { uri, at: Date.now() };
        return uri;
      }
    }
  } catch { /* use canonical */ }

  return canonical;
};

export const getKycPortConfig = (): KycPortConfig => {
  const apiBaseUrl = trimSlash(import.meta.env.VITE_KYCPORT_API_BASE_URL || DEFAULT_API);
  const authorizeUrl = trimSlash(
    import.meta.env.VITE_KYCPORT_AUTHORIZE_URL
    || import.meta.env.VITE_KYCPORT_OAUTH_ENTRY_URL
    || import.meta.env.VITE_KYCPORT_LOGIN_URL
    || DEFAULT_AUTHORIZE,
  );

  return {
    apiBaseUrl,
    authorizeUrl,
    loginUrl: `${authorizeUrl}/`,
    clientId: import.meta.env.VITE_KYCPORT_CLIENT_ID || "",
    redirectUri: getKycPortRedirectUri() || import.meta.env.VITE_KYCPORT_REDIRECT_URI || "",
    scopes: import.meta.env.VITE_KYCPORT_SCOPES || DEFAULT_SCOPES,
    chainId: Number(
      import.meta.env.VITE_KYCPORT_CHAIN_ID
      || import.meta.env.VITE_GARUDA_CHAIN_ID
      || 974540,
    ),
    network:
      import.meta.env.VITE_KYCPORT_NETWORK
      || import.meta.env.VITE_GARUDA_CHAIN_NAME
      || "Garuda Prime",
    appName: import.meta.env.VITE_KYCPORT_APP_NAME || "Garuda Prime",
    appOrigin: import.meta.env.VITE_APP_ORIGIN || "https://app.garudaprime.id",
    partnerId: import.meta.env.VITE_KYCPORT_PARTNER_ID || "garudaprime",
    paths: {
      health: ensureSlash(import.meta.env.VITE_KYCPORT_HEALTH_PATH || "/health"),
      oidcToken: ensureSlash(import.meta.env.VITE_KYCPORT_OIDC_TOKEN_PATH || "/oidc/token/"),
      oidcUserinfo: ensureSlash(import.meta.env.VITE_KYCPORT_OIDC_USERINFO_PATH || "/oidc/userinfo/"),
      verifyWeb: trimSlash(import.meta.env.VITE_KYCPORT_VERIFY_URL || `${DEFAULT_PORTAL_WEB}/verify`),
    },
  };
};

export const isKycPortOAuthConfigured = () => {
  const cfg = getKycPortConfig();
  return Boolean(cfg.clientId && cfg.redirectUri);
};

export const isKycPortPortalOnlyMode = () => !isKycPortOAuthConfigured();

export const isKycPortApiConfigured = () => Boolean(getKycPortConfig().apiBaseUrl);

export const getKycPortPortalWebUrl = (): string => {
  const base = trimSlash(import.meta.env.VITE_KYCPORT_PORTAL_URL || DEFAULT_PORTAL_WEB);
  return `${base}/`;
};

export const getKycPortVerifyUrl = (): string => getKycPortConfig().paths.verifyWeb;

export const openKycPortPortalLogin = () => {
  window.open(getKycPortOAuthLoginEntry(), "_blank", "noopener,noreferrer");
};

export const openKycPortVerify = () => {
  window.open(getKycPortVerifyUrl(), "_blank", "noopener,noreferrer");
};

/** Force www, bare kycport.com breaks OAuth routing. */
export const normalizeKycPortOAuthBase = (url: string): string => {
  const trimmed = trimSlash(url);
  if (/^https:\/\/kycport\.com/i.test(trimmed)) {
    return trimmed.replace(/^https:\/\/kycport\.com/i, "https://www.kycport.com");
  }
  if (/^https:\/\/id\.kycport\.com/i.test(trimmed)) {
    return trimmed.replace(/^https:\/\/id\.kycport\.com/i, "https://www.kycport.com");
  }
  return trimmed;
};

/** OIDC authorize entry (Sign in with KYCport). */
export const getKycPortOAuthLoginEntry = (): string => {
  const override = import.meta.env.VITE_KYCPORT_OAUTH_ENTRY_URL?.trim();
  if (override) return normalizeKycPortOAuthBase(override);
  const loginEnv = import.meta.env.VITE_KYCPORT_LOGIN_URL?.trim();
  if (loginEnv) return normalizeKycPortOAuthBase(loginEnv);
  return DEFAULT_AUTHORIZE;
};

export const getKycPortOAuthAuthorizeEntry = (): string => getKycPortOAuthLoginEntry();

export const getKycPortOAuthEntryUrl = (): string => getKycPortOAuthLoginEntry();

export const getKycPortConsoleUrl = () => {
  const base = trimSlash(import.meta.env.VITE_KYCPORT_PORTAL_URL || DEFAULT_PORTAL_WEB);
  return `${base}/console`;
};

/**
 * Build OIDC authorize URL (authorization code + PKCE).
 * @see https://www.kycport.com/api/oidc/.well-known/openid-configuration
 */
export const buildKycPortLoginUrl = (params?: {
  state?: string;
  nonce?: string;
  clientId?: string;
  codeChallenge?: string;
  redirectUri?: string;
  loginUrl?: string;
  entryUrl?: string;
  prompt?: "login" | "consent";
}) => {
  const cfg = getKycPortConfig();
  const rawBase = params?.entryUrl || params?.loginUrl || getKycPortOAuthLoginEntry();
  const base = normalizeKycPortOAuthBase(rawBase);
  const redirectUri = params?.redirectUri || cfg.redirectUri;
  const q = new URLSearchParams({
    response_type: "code",
    response_mode: "query",
  });
  const clientId = params?.clientId ?? cfg.clientId;
  if (clientId) q.set("client_id", clientId);
  if (redirectUri) q.set("redirect_uri", redirectUri);
  if (cfg.scopes) q.set("scope", cfg.scopes);
  if (params?.state) q.set("state", params.state);
  if (params?.nonce) q.set("nonce", params.nonce);
  if (params?.codeChallenge) {
    q.set("code_challenge", params.codeChallenge);
    q.set("code_challenge_method", "S256");
  }
  if (params?.prompt) q.set("prompt", params.prompt);
  return `${base}?${q.toString()}`;
};

export const buildKycPortApiUrl = (path: string) =>
  `${getKycPortConfig().apiBaseUrl}${ensureSlash(path)}`;
