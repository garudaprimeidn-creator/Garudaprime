import {
  getKycPortConfig, isKycPortOAuthConfigured, buildKycPortLoginUrl, isKycPortPortalOnlyMode,
  getKycPortRedirectUri, getKycPortOAuthLoginEntry, getKycPortVerifyUrl, resolveKycPortRedirectUri,
} from "./kycportConfig";
import type { KycPortOAuthServerConfig } from "./kycportApi";
import {
  openKycPortOAuthPopup,
  listenKycPortOAuthPopup,
  setKycPortAwaiting,
  isKycPortAwaiting,
  cleanKycPortOAuthPath,
  KYCPORT_REDIRECT_FALLBACK_KEY,
  clearKycPortRedirectFallback,
  type KycPortOAuthMessage,
} from "./kycportOAuthFlow";
import {
  getKycPortOAuthCallbackParams,
  loadKycPortCallbackSnapshot,
  clearKycPortCallbackSnapshot,
  preserveKycPortCallbackSnapshot,
} from "./kycportCallbackParams";
import {
  fetchKycPortOAuthConfig,
  resolveKycPortOAuthReady,
} from "./kycportApi";
import {
  exchangeKycPortCode,
  extractAccessToken,
  fetchKycPortSync,
  fetchKycPortStatus,
  fetchKycPortUser,
  getKycPortVerificationSession,
  normalizeKycPortUser,
  normalizeVerificationSession,
  KycPortApiError,
  type KycPortApiUser,
} from "./kycportApi";
import { isKycPortAssuranceVerified } from "./kycportStatus";
import {
  clearKycPortOAuth,
  loadKycPortOAuth,
  loadKycPortOAuthAsync,
  saveKycPortOAuth,
  saveKycPortSession,
  saveKycPortTokens,
  getKycPortAccessToken,
  getKycPortSession,
  saveKycPortPendingExchange,
  clearKycPortPendingExchange,
  loadKycPortPendingExchange,
  type StoredKycPortSession,
} from "./kycportStorage";
import { upsertKycPortProfile, saveKycVerification } from "../firebase/firestoreService";
import { syncKycPortApplication } from "./kycApplicationService";
import { uidFromKycPortUserId } from "./kycportUid";
import { isDemoAuthAllowed } from "../env/production";

export type KycPortUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  kycStatus: string;
  kycTier: number;
  verifiedAt?: string;
};

export type KycPortAuthSession = {
  referenceId: string;
  provider: "KYCPORT";
  user: KycPortUser;
  accessToken?: string;
  isDemo: boolean;
};

export const isKycPortPortalMode = () => isKycPortPortalOnlyMode();

export type KycPortVerification = {
  sessionId: string;
  verificationUrl?: string;
  status: string;
  tier: number;
  isDemo: boolean;
};

const randomString = (len = 32) => {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
};

const base64Url = (buffer: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const generatePkce = async () => {
  const codeVerifier = base64Url(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = base64Url(digest);
  return { codeVerifier, codeChallenge };
};

const resolveKycPortOAuthLoginEntry = (serverCfg: KycPortOAuthServerConfig | null) => {
  const fromServer = serverCfg?.authorizationEndpoint
    || serverCfg?.loginUrl
    || serverCfg?.oauthEntryUrl
    || serverCfg?.authorizeUrl;
  if (fromServer) return fromServer;
  return getKycPortOAuthLoginEntry();
};

export const buildKycPortAuthorizeUrl = async (returnMode: "login" | "verify") => {
  const state = randomString(16);
  const nonce = randomString(16);
  const { codeVerifier, codeChallenge } = await generatePkce();
  const redirectUri = await resolveKycPortRedirectUri();
  saveKycPortOAuth({ state, nonce, codeVerifier, returnMode, redirectUri });

  const serverCfg = await fetchKycPortOAuthConfig().catch(() => null);
  const clientId = serverCfg?.clientId || getKycPortConfig().clientId || undefined;
  return buildKycPortLoginUrl({
    state,
    nonce,
    codeChallenge,
    redirectUri,
    clientId,
    entryUrl: resolveKycPortOAuthLoginEntry(serverCfg),
  });
};

const buildKycPortAuthorizeUrlFromPending = async (
  pending: NonNullable<Awaited<ReturnType<typeof loadKycPortOAuthAsync>>>,
  prompt?: "login" | "consent",
) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(pending.codeVerifier),
  );
  const codeChallenge = base64Url(digest);
  const serverCfg = await fetchKycPortOAuthConfig().catch(() => null);
  const redirectUri = await resolveKycPortRedirectUri();
  return buildKycPortLoginUrl({
    state: pending.state,
    nonce: pending.nonce || undefined,
    codeChallenge,
    redirectUri,
    clientId: serverCfg?.clientId || getKycPortConfig().clientId || undefined,
    entryUrl: resolveKycPortOAuthLoginEntry(serverCfg),
    prompt,
  });
};

/** Finish OAuth if callback params, snapshot, pending code, or stored token exist. */
export const tryFinalizeKycPortOAuth = async (
  returnMode: "login" | "verify" = "login",
): Promise<KycPortAuthSession | null> => {
  const fromUrl = await completeKycPortOAuthFromUrl();
  if (fromUrl?.session) return fromUrl.session;

  const pendingEx = loadKycPortPendingExchange();
  if (pendingEx?.code && pendingEx.codeVerifier) {
    try {
      const tokenPayload = await exchangeKycPortCode(
        pendingEx.code,
        pendingEx.codeVerifier,
        pendingEx.redirectUri || getKycPortRedirectUri(),
        pendingEx.nonce,
      );
      const accessToken = extractAccessToken(tokenPayload);
      if (accessToken) {
        saveKycPortTokens(accessToken, tokenPayload.refresh_token);
        const synced = tokenPayload.user
          ? normalizeKycPortUser(tokenPayload.user)
          : await fetchKycPortSync(accessToken);
        const user: KycPortUser = {
          id: synced.id,
          email: synced.email,
          fullName: synced.fullName,
          phone: synced.phone,
          kycStatus: synced.kycStatus,
          kycTier: synced.kycTier,
          verifiedAt: synced.verifiedAt,
        };
        const session = buildSessionFromUser(user, accessToken, false);
        persistSession(session);
        clearKycPortPendingExchange();
        clearKycPortOAuth();
        setKycPortAwaiting(false);
        return session;
      }
    } catch {
      /* fall through to authorize resume */
    }
  }

  const tokenSession = await refreshKycPortFromStoredToken();
  if (tokenSession?.accessToken) return tokenSession;

  return null;
};

const openKycPortLogin = (_state?: string) => {
  window.open(buildKycPortLoginUrl({}), "_blank", "noopener,noreferrer");
};

const OAUTH_POPUP_TIMEOUT_MS = 90_000;
/** Wait for callback postMessage after popup closes (bridge runs in popup boot). */
const OAUTH_POPUP_CLOSE_GRACE_MS = 1_800;

const redirectKycPortOAuth = (url: string): Promise<never> => {
  sessionStorage.setItem(KYCPORT_REDIRECT_FALLBACK_KEY, "1");
  window.location.assign(url);
  return new Promise(() => { /* navigates away */ });
};

/** Popup keeps Garuda tab open; full redirect loses users on kycport.com/status. */
const prefersKycPortFullRedirect = () => {
  if (typeof window === "undefined") return false;
  return import.meta.env.VITE_KYCPORT_OAUTH_FULL_REDIRECT === "true";
};

const runKycPortOAuthPopup = (
  url: string,
  returnMode: "login" | "verify",
  options?: { forcePopup?: boolean },
): Promise<KycPortAuthSession | null> => {
  setKycPortAwaiting(true);

  const usePopup = options?.forcePopup || !prefersKycPortFullRedirect();

  if (!usePopup) {
    window.location.assign(url);
    return new Promise(() => { /* page navigates away, callback handled on return */ });
  }

  const popup = openKycPortOAuthPopup(url);
  if (!popup) {
    window.location.assign(url);
    return new Promise(() => { /* full redirect fallback */ });
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result: KycPortAuthSession | null) => {
      if (settled) return;
      settled = true;
      setKycPortAwaiting(false);
      resolve(result);
    };

    const cleanup = listenKycPortOAuthPopup(async (msg) => {
      cleanup();
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      try {
        const result = await completeKycPortOAuthFromMessage(msg, returnMode);
        finish(result.session);
      } catch (e) {
        reject(e);
      }
    });

    const pollTimer = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      if (settled) return;

      window.setTimeout(async () => {
        if (settled) return;
        try {
          const session = await tryFinalizeKycPortOAuth(returnMode);
          if (session) {
            finish(session);
            return;
          }
        } catch (e) {
          reject(e);
          return;
        }
        reject(Object.assign(
          new Error(
            "Login KYC Port belum selesai. Selesaikan di jendela KYC Port, lalu tap Connect KYCPort lagi.",
          ),
          { code: "kycport/pending" },
        ));
      }, OAUTH_POPUP_CLOSE_GRACE_MS);
    }, 400);

    const timeoutTimer = window.setTimeout(() => {
      cleanup();
      clearInterval(pollTimer);
      if (!settled) finish(null);
    }, OAUTH_POPUP_TIMEOUT_MS);
  });
};

/** Open KYCPORT OAuth, popup keeps Garuda tab open. Returns session when callback succeeds. */
export const startKycPortOAuth = async (
  returnMode: "login" | "verify" = "login",
): Promise<KycPortAuthSession | null> => {
  const url = await buildKycPortAuthorizeUrl(returnMode);
  return runKycPortOAuthPopup(url, returnMode, { forcePopup: true });
};

/**
 * Resume when user returned from kycport.com/status, popup OAuth on Sign-in only
 * (never /o/authorize, blank page). Callback completes in popup → Garuda tab.
 */
export const resumeKycPortOAuth = async (
  returnMode: "login" | "verify" = "login",
): Promise<KycPortAuthSession | null> => {
  const finalized = await tryFinalizeKycPortOAuth(returnMode);
  if (finalized) return finalized;

  const pending = await loadKycPortOAuthAsync();
  if (!pending) return startKycPortOAuth(returnMode);

  const url = await buildKycPortAuthorizeUrlFromPending(pending, "consent");
  const session = await runKycPortOAuthPopup(url, returnMode, { forcePopup: true });
  if (session) return session;

  throw Object.assign(
    new Error(
      "Login KYC Port belum selesai. Selesaikan di jendela KYC Port, lalu tap Lanjutkan lagi.",
    ),
    { code: "kycport/pending" },
  );
};

const completeKycPortOAuthFromMessage = async (
  msg: KycPortOAuthMessage,
  returnMode: "login" | "verify",
) => {
  if (msg.error) {
    clearKycPortOAuth();
    throw Object.assign(
      new Error(msg.error_description || msg.error),
      { code: `kycport/${msg.error}` },
    );
  }

  const params = new URLSearchParams();
  if (msg.code) params.set("code", msg.code);
  if (msg.state) params.set("state", msg.state);

  const originalSearch = window.location.search;
  const qs = params.toString();
  window.history.replaceState({}, "", `${window.location.pathname}?${qs}`);

  const result = await completeKycPortOAuthFromUrl();
  window.history.replaceState({}, "", `${window.location.pathname}${originalSearch}`);

  if (!result) {
    throw Object.assign(new Error("KYCPORT callback incomplete"), { code: "kycport/auth-failed" });
  }
  if (result.returnMode !== returnMode && returnMode === "login") {
    return result;
  }
  return result;
};

export const isKycPortConnectionPending = () =>
  isKycPortAwaiting() || Boolean(loadKycPortOAuth());

const demoAuthSession = (): KycPortAuthSession => {
  const referenceId = `kycport_${Date.now().toString(36)}`;
  return {
    referenceId,
    provider: "KYCPORT",
    isDemo: true,
    user: {
      id: referenceId,
      email: "",
      fullName: "KYCPort User",
      phone: "",
      kycStatus: "pending",
      kycTier: 2,
    },
  };
};

/** Demo connect when OAuth/API unavailable (local dev only) */
export const connectKycPortDemo = async (): Promise<KycPortAuthSession> => {
  if (!isDemoAuthAllowed()) {
    throw Object.assign(new Error("KYCPORT demo auth disabled in production"), { code: "kycport/not-configured" });
  }
  await new Promise((r) => setTimeout(r, 900));
  const session = demoAuthSession();
  persistSession(session);
  return session;
};

const sessionFromStored = (stored: StoredKycPortSession, token?: string): KycPortAuthSession => ({
  referenceId: stored.referenceId,
  provider: "KYCPORT",
  accessToken: token,
  isDemo: stored.isDemo,
  user: {
    id: stored.userId,
    email: stored.email ?? "",
    fullName: stored.fullName ?? "KYCPort User",
    phone: stored.phone ?? "",
    kycStatus: stored.kycStatus,
    kycTier: stored.kycTier ?? 0,
    verifiedAt: stored.verifiedAt,
  },
});

const persistSession = (session: KycPortAuthSession) => {
  const stored: StoredKycPortSession = {
    referenceId: session.referenceId,
    userId: session.user.id,
    email: session.user.email,
    fullName: session.user.fullName,
    phone: session.user.phone,
    kycStatus: session.user.kycStatus,
    kycTier: session.user.kycTier,
    verifiedAt: session.user.verifiedAt,
    isDemo: session.isDemo,
  };
  saveKycPortSession(stored);
};

const buildSessionFromUser = (user: KycPortUser, accessToken: string, isDemo: boolean): KycPortAuthSession => ({
  referenceId: user.id,
  provider: "KYCPORT",
  accessToken,
  isDemo,
  user,
});

/** Persist KYCPORT profile + verification to Firestore (users + kyc_applications). */
export async function syncKycPortUserToApp(uid: string, user: KycPortUser, isDemo: boolean) {
  const cfg = getKycPortConfig();
  const tier = mapKycStatusToTier(user.kycStatus, user.kycTier);
  await upsertKycPortProfile(uid, {
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    kycportUserId: user.id,
    kycStatus: user.kycStatus,
    kycTier: tier,
    kycportVerifiedAt: user.verifiedAt ?? null,
    kycPartnerId: cfg.partnerId,
    kycAppName: cfg.appName,
  });
  await saveKycVerification(uid, {
    status: user.kycStatus,
    tier,
    provider: "KYCPORT",
  });
  if (!isDemo) {
    await syncKycPortApplication(uid, {
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      status: user.kycStatus,
      tier,
      verifiedAt: user.verifiedAt ?? null,
      partnerId: cfg.partnerId,
      appName: cfg.appName,
    });
  }
}

export const kycPortUidForUser = (kycportUserId: string) => uidFromKycPortUserId(kycportUserId);

/** Refresh profile from stored access token (on app load). */
export const refreshKycPortFromStoredToken = async (): Promise<KycPortAuthSession | null> => {
  const token = getKycPortAccessToken();
  const stored = getKycPortSession();
  if (!token) return stored ? sessionFromStored(stored) : null;

  try {
    const synced = await fetchKycPortSync(token);
    const user: KycPortUser = {
      id: synced.id,
      email: synced.email,
      fullName: synced.fullName,
      phone: synced.phone,
      kycStatus: synced.kycStatus,
      kycTier: synced.kycTier,
      verifiedAt: synced.verifiedAt,
    };
    const session = buildSessionFromUser(user, token, false);
    persistSession(session);
    return session;
  } catch {
    return stored ? sessionFromStored(stored, token) : null;
  }
};

/** Complete OAuth callback from redirect URI (?code=&state= or #fragment). */
export const completeKycPortOAuthFromUrl = async (): Promise<{
  session: KycPortAuthSession;
  returnMode: "login" | "verify";
} | null> => {
  preserveKycPortCallbackSnapshot();
  let params = getKycPortOAuthCallbackParams();
  if (!params.get("code") && !params.get("access_token") && !params.get("token")) {
    const snap = loadKycPortCallbackSnapshot();
    if (snap) params = snap;
  }

  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  if (error) {
    clearKycPortOAuth();
    clearKycPortCallbackSnapshot();
    const desc = params.get("error_description") || error;
    const isRedirectMismatch =
      error === "redirect_uri_mismatch"
      || /return address|redirect_uri|isn't registered/i.test(desc);
    throw Object.assign(new Error(desc), {
      code: isRedirectMismatch ? "kycport/redirect-mismatch" : `kycport/${error}`,
    });
  }

  const pending = await loadKycPortOAuthAsync();
  const returnMode = pending?.returnMode ?? "login";

  if (!code || !state) return null;

  if (!pending || pending.state !== state) {
    clearKycPortCallbackSnapshot();
    throw Object.assign(
      new Error(
        "Sesi OAuth kedaluwarsa. Buka lagi Verifikasi KYCPORT dari Garuda Prime (jangan bookmark halaman callback).",
      ),
      { code: "kycport/invalid-state" },
    );
  }

  const returnModeResolved = pending.returnMode;
  const redirectUri = await resolveKycPortRedirectUri();
  saveKycPortPendingExchange({
    code,
    codeVerifier: pending.codeVerifier,
    redirectUri,
    nonce: pending.nonce,
  });

  try {
    const tokenPayload = await exchangeKycPortCode(
      code,
      pending.codeVerifier,
      redirectUri,
      pending.nonce,
    );
    const accessToken = extractAccessToken(tokenPayload);
    if (!accessToken) throw new KycPortApiError("No access token in callback", "kycport/no-token", 400);
    saveKycPortTokens(accessToken, tokenPayload.refresh_token);

    const synced = tokenPayload.user
      ? normalizeKycPortUser(tokenPayload.user)
      : await fetchKycPortSync(accessToken).catch(async () => {
        const profile = normalizeKycPortUser(await fetchKycPortUser(accessToken));
        const kyc = await fetchKycPortStatus(accessToken).catch(() => null);
        return {
          ...profile,
          kycStatus: kyc?.status ?? profile.kycStatus,
          kycTier: kyc?.tier ?? profile.kycTier,
          verifiedAt: kyc?.verified_at ?? profile.verifiedAt,
        };
      });

    const user: KycPortUser = {
      id: synced.id,
      email: synced.email,
      fullName: synced.fullName,
      phone: synced.phone,
      kycStatus: synced.kycStatus,
      kycTier: synced.kycTier,
      verifiedAt: synced.verifiedAt,
    };
    const session = buildSessionFromUser(user, accessToken, false);
    persistSession(session);
    clearKycPortPendingExchange();
    clearKycPortOAuth();
    clearKycPortCallbackSnapshot();
    cleanOAuthParams(params);
    clearKycPortRedirectFallback();
    setKycPortAwaiting(false);
    return { session, returnMode: returnModeResolved };
  } catch (e) {
    const apiErr = e as KycPortApiError;
    if (apiErr?.status === 403) {
      clearKycPortOAuth();
      clearKycPortCallbackSnapshot();
      cleanOAuthParams(params);
      setKycPortAwaiting(false);
      throw Object.assign(
        new Error(
          "Tenant Garuda Prime belum aktif di KYC Port atau client_secret tidak valid. Hubungi tim KYC Port.",
        ),
        { code: "kycport/tenant-inactive", status: 403 },
      );
    }
    if (apiErr?.status === 502 || apiErr?.status === 504) {
      clearKycPortOAuth();
      clearKycPortCallbackSnapshot();
      cleanOAuthParams(params);
      setKycPortAwaiting(false);
      throw Object.assign(
        new Error(
          "API KYC Port sedang gangguan (502). Status Verified di kycport.com belum bisa disinkronkan, coba lagi saat layanan pulih.",
        ),
        { code: "kycport/exchange-failed", status: apiErr.status },
      );
    }
    if (isDemoAuthAllowed() && (apiErr?.status === 404 || apiErr?.status === 0)) {
      const demo = demoAuthSession();
      persistSession(demo);
      clearKycPortPendingExchange();
      clearKycPortOAuth();
      clearKycPortCallbackSnapshot();
      cleanOAuthParams(params);
      setKycPortAwaiting(false);
      return { session: demo, returnMode: returnModeResolved };
    }
    // Keep pending exchange for finishKycPortAuth / resume, do not fabricate a session.
    cleanOAuthParams(params);
    setKycPortAwaiting(true);
    throw Object.assign(
      new Error(
        "Gagal menukar kode OAuth KYC Port. Tap Lanjutkan / Connect KYCPort untuk mencoba lagi.",
      ),
      { code: "kycport/exchange-pending" },
    );
  }
};

const cleanOAuthParams = (params: URLSearchParams) => {
  ["code", "state", "session_state", "access_token", "token"].forEach((k) => params.delete(k));
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
  window.history.replaceState({}, "", next);
};

export const getKycPortReturnMode = () => loadKycPortOAuth()?.returnMode ?? null;

/** OAuth verify-only redirect (registration KYC step) */
export const startKycPortVerifyOAuth = async () => startKycPortOAuth("verify");

/** Login/connect, BFF redirect per kycport.com/docs (authorization code + PKCE). */
export const connectKycPort = async (): Promise<KycPortAuthSession> => {
  const oauthReady = await resolveKycPortOAuthReady();
  if (!oauthReady) {
    if (isDemoAuthAllowed()) return connectKycPortDemo();
    throw Object.assign(
      new Error("OAuth KYCPort belum dikonfigurasi. Hubungi admin."),
      { code: "kycport/not-configured" },
    );
  }

  const finalized = await tryFinalizeKycPortOAuth("login");
  if (finalized) return finalized;

  if (loadKycPortOAuth()) {
    return resumeKycPortOAuth("login");
  }

  const url = await buildKycPortAuthorizeUrl("login");
  sessionStorage.setItem(KYCPORT_REDIRECT_FALLBACK_KEY, "1");
  window.location.assign(url);
  throw Object.assign(new Error("Redirecting to KYCPort…"), { code: "kycport/redirecting" });
};

/** Start KYC verification, OAuth popup only; data syncs to Garuda Prime (no Sidra portal). */
export const startKycPortVerification = async (): Promise<KycPortVerification> => {
  const cfg = getKycPortConfig();

  if (await resolveKycPortOAuthReady()) {
    const session = await startKycPortVerifyOAuth();
    if (!session) {
      throw Object.assign(
        new Error("Login KYCPORT belum selesai. Selesaikan di popup lalu kembali ke Garuda Prime"),
        { code: "kycport/pending" },
      );
    }
    const verified = isKycPortAssuranceVerified(session.user.kycStatus);
    return {
      sessionId: session.referenceId,
      status: session.user.kycStatus,
      tier: session.user.kycTier,
      isDemo: session.isDemo,
      verificationUrl: verified ? undefined : getKycPortVerifyUrl(),
    };
  }

  const token = getKycPortAccessToken();

  if (token) {
    try {
      const synced = await fetchKycPortSync(token);
      const verified = isKycPortAssuranceVerified(synced.kycStatus);
      return {
        sessionId: synced.id,
        status: synced.kycStatus,
        tier: synced.kycTier,
        isDemo: false,
        verificationUrl: verified ? undefined : getKycPortVerifyUrl(),
      };
    } catch { /* fall through */ }
  }

  if (isKycPortPortalOnlyMode() || !isDemoAuthAllowed()) {
    throw Object.assign(
      new Error("OAuth Garuda Prime belum dikonfigurasi. Hubungi admin"),
      { code: "kycport/not-configured" },
    );
  }

  await new Promise((r) => setTimeout(r, 600));
  return {
    sessionId: `demo_${Date.now().toString(36)}`,
    verificationUrl: cfg.loginUrl,
    status: "pending",
    tier: 3,
    isDemo: true,
  };
};

/** Poll verification session status */
export const refreshKycPortVerification = async (sessionId: string): Promise<KycPortVerification> => {
  const token = getKycPortAccessToken();
  if (token && !sessionId.startsWith("demo_") && !sessionId.startsWith("pending_")) {
    try {
      const raw = await getKycPortVerificationSession(token, sessionId);
      const session = normalizeVerificationSession(raw);
      return { ...session, isDemo: false };
    } catch { /* demo fallback */ }
  }

  if (token && !sessionId.startsWith("demo_")) {
    try {
      const synced = await fetchKycPortSync(token);
      return {
        sessionId,
        status: synced.kycStatus,
        tier: synced.kycTier,
        isDemo: false,
      };
    } catch { /* fall through */ }
  }

  return { sessionId, status: "pending", tier: isDemoAuthAllowed() ? 3 : 0, isDemo: isDemoAuthAllowed() };
};

export const mapKycStatusToTier = (status: string, tier?: number): number => {
  const s = status.toLowerCase();
  if (isKycPortAssuranceVerified(s)) return Math.max(tier ?? 3, 3);
  if (s === "pending" || s === "processing" || s === "submitted") return Math.min(tier ?? 1, 2);
  if (s === "rejected" || s === "expired" || s === "unverified") return tier ?? 0;
  return tier ?? 0;
};
