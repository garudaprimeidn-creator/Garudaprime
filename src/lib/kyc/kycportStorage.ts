import { secureGet, secureGetAsync, secureRemove, secureSet } from "../security/secureStorage";

const OAUTH_STATE_KEY = "kycport_oauth_state";
const CODE_VERIFIER_KEY = "kycport_code_verifier";
const OAUTH_PENDING_KEY = "gp_kycport_oauth_pending";
const OAUTH_PENDING_LS_KEY = "gp_kycport_oauth_pending_ls";
const OAUTH_PENDING_TTL_MS = 30 * 60 * 1000;
const ACCESS_TOKEN_KEY = "kycport_access_token";
const REFRESH_TOKEN_KEY = "kycport_refresh_token";
const SESSION_KEY = "kycport_session";

export type StoredKycPortOAuth = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnMode: "login" | "verify";
  redirectUri: string;
};

export type StoredKycPortSession = {
  referenceId: string;
  userId: string;
  email?: string;
  fullName?: string;
  phone?: string;
  kycStatus: string;
  kycTier?: number;
  verifiedAt?: string;
  isDemo: boolean;
};

const PENDING_EXCHANGE_KEY = "kycport_pending_exchange";

export type StoredKycPortPendingExchange = {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  nonce?: string;
};

export const saveKycPortPendingExchange = (data: StoredKycPortPendingExchange) => {
  sessionStorage.setItem(PENDING_EXCHANGE_KEY, JSON.stringify(data));
};

export const loadKycPortPendingExchange = (): StoredKycPortPendingExchange | null => {
  try {
    const raw = sessionStorage.getItem(PENDING_EXCHANGE_KEY);
    return raw ? JSON.parse(raw) as StoredKycPortPendingExchange : null;
  } catch {
    return null;
  }
};

export const clearKycPortPendingExchange = () => {
  sessionStorage.removeItem(PENDING_EXCHANGE_KEY);
};

/** Persist OAuth PKCE + state synchronously before redirect (survives cross-site return). */
export const saveKycPortOAuth = (data: StoredKycPortOAuth) => {
  const payload = JSON.stringify({ ...data, savedAt: Date.now() });
  sessionStorage.setItem(OAUTH_PENDING_KEY, payload);
  try {
    localStorage.setItem(OAUTH_PENDING_LS_KEY, payload);
  } catch { /* private mode */ }
  sessionStorage.setItem("gp_kycport_return_mode", data.returnMode);
  secureSet(OAUTH_STATE_KEY, data.state);
  secureSet(CODE_VERIFIER_KEY, data.codeVerifier);
};

const readOAuthPayload = (raw: string | null): StoredKycPortOAuth | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredKycPortOAuth & { savedAt?: number };
    if (parsed.savedAt && Date.now() - parsed.savedAt > OAUTH_PENDING_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
};

const loadLegacyKycPortOAuth = (): StoredKycPortOAuth | null => {
  const state = secureGet(OAUTH_STATE_KEY);
  const codeVerifier = secureGet(CODE_VERIFIER_KEY);
  const returnMode = sessionStorage.getItem("gp_kycport_return_mode") as "login" | "verify" | null;
  if (!state || !codeVerifier || !returnMode) return null;
  return { state, nonce: "", codeVerifier, returnMode, redirectUri: "" };
};

export const loadKycPortOAuth = (): StoredKycPortOAuth | null => {
  try {
    const fromSession = readOAuthPayload(sessionStorage.getItem(OAUTH_PENDING_KEY));
    if (fromSession) return fromSession;
    const fromLocal = readOAuthPayload(localStorage.getItem(OAUTH_PENDING_LS_KEY));
    if (fromLocal) return fromLocal;
  } catch { /* fall through */ }
  return loadLegacyKycPortOAuth();
};

/** Async load, decrypts legacy secureStorage if sessionStorage blob missing. */
export const loadKycPortOAuthAsync = async (): Promise<StoredKycPortOAuth | null> => {
  const sync = loadKycPortOAuth();
  if (sync?.redirectUri) return sync;
  if (sync) return sync;

  const state = await secureGetAsync(OAUTH_STATE_KEY);
  const codeVerifier = await secureGetAsync(CODE_VERIFIER_KEY);
  const returnMode = sessionStorage.getItem("gp_kycport_return_mode") as "login" | "verify" | null;
  if (!state || !codeVerifier || !returnMode) return null;
  return { state, nonce: "", codeVerifier, returnMode, redirectUri: "" };
};

export const clearKycPortOAuth = () => {
  sessionStorage.removeItem(OAUTH_PENDING_KEY);
  try {
    localStorage.removeItem(OAUTH_PENDING_LS_KEY);
  } catch { /* ignore */ }
  sessionStorage.removeItem("gp_kycport_return_mode");
  secureRemove(OAUTH_STATE_KEY);
  secureRemove(CODE_VERIFIER_KEY);
};

export const saveKycPortTokens = (accessToken: string, refreshToken?: string) => {
  // Ephemeral session storage only, BFF holds secrets; tokens must not persist in localStorage.
  try {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    if (refreshToken) sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } catch { /* private mode */ }
  secureRemove(ACCESS_TOKEN_KEY);
  secureRemove(REFRESH_TOKEN_KEY);
};

export const getKycPortAccessToken = () => {
  try {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY) ?? secureGet(ACCESS_TOKEN_KEY);
  } catch {
    return secureGet(ACCESS_TOKEN_KEY);
  }
};

export const getKycPortAccessTokenAsync = async () => {
  try {
    const fromSession = sessionStorage.getItem(ACCESS_TOKEN_KEY);
    if (fromSession) return fromSession;
  } catch { /* ignore */ }
  return secureGetAsync(ACCESS_TOKEN_KEY);
};

export const clearKycPortTokens = () => {
  try {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch { /* ignore */ }
  secureRemove(ACCESS_TOKEN_KEY);
  secureRemove(REFRESH_TOKEN_KEY);
};

/** After Firebase session is established, drop OIDC tokens from the browser. */
export const clearKycPortTokensAfterAuth = () => {
  clearKycPortTokens();
};

export const saveKycPortSession = (session: StoredKycPortSession) => {
  secureSet(SESSION_KEY, JSON.stringify(session));
};

export const getKycPortSession = (): StoredKycPortSession | null => {
  try {
    const raw = secureGet(SESSION_KEY);
    return raw ? JSON.parse(raw) as StoredKycPortSession : null;
  } catch {
    return null;
  }
};

export const clearKycPortSession = () => secureRemove(SESSION_KEY);
