import {
  extractKycClaimsFromIdToken,
  fetchKycPortOidcDiscovery,
  validateKycPortIdTokenClaims,
} from "./kycportOidc.js";

const trimSlash = (url: string) => url.replace(/\/+$/, "");
const ensureSlash = (path: string) => (path.endsWith("/") ? path : `${path}/`);

/** KYCport 2.0, OIDC on www.kycport.com (legacy id.kycport.com/api is deprecated/offline). */
export const DEFAULT_KYCPORT_API = "https://www.kycport.com/api";
export const DEFAULT_KYCPORT_AUTHORIZE = "https://www.kycport.com/authorize";
export const DEFAULT_KYCPORT_REDIRECT_URI = "https://app.garudaprime.id/auth/kycport/callback";

export type KycPortServerConfig = {
  apiBaseUrl: string;
  clientId: string;
  redirectUri: string;
  paths: {
    /** POST OIDC token exchange */
    oidcToken: string;
    /** GET OIDC userinfo (profile + kyc claims) */
    oidcUserinfo: string;
    health: string;
  };
};

export type KycPortHealthResult = {
  reachable: boolean;
  apiDegraded: boolean;
  apiStatus: number;
  loginStatus: number;
  oidcDiscoveryOk?: boolean;
  message?: string;
};

export function parseKycTierValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value ?? "").trim().toLowerCase();
  const tierMatch = s.match(/^t(\d)$/);
  if (tierMatch) return Number(tierMatch[1]);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Probe KYC Port OIDC API + authorize UI before OAuth. */
export async function checkKycPortHealth(): Promise<KycPortHealthResult> {
  const cfg = getKycPortServerConfig();
  const authorizeUrl = (
    process.env.KYCPORT_OAUTH_ENTRY_URL
    || process.env.VITE_KYCPORT_OAUTH_ENTRY_URL
    || process.env.KYCPORT_LOGIN_URL
    || process.env.VITE_KYCPORT_LOGIN_URL
    || DEFAULT_KYCPORT_AUTHORIZE
  ).replace(/\/+$/, "");

  let apiStatus = 0;
  let loginStatus = 0;
  let oidcDiscoveryOk = false;

  try {
    const apiRes = await fetch(`${cfg.apiBaseUrl}${cfg.paths.health}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    apiStatus = apiRes.status;
  } catch {
    apiStatus = 0;
  }

  try {
    const discRes = await fetch(`${cfg.apiBaseUrl}/oidc/.well-known/openid-configuration`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    oidcDiscoveryOk = discRes.ok;
    if (!apiStatus || apiStatus >= 500) {
      apiStatus = discRes.status;
    }
  } catch {
    oidcDiscoveryOk = false;
  }

  try {
    const loginRes = await fetch(authorizeUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    loginStatus = loginRes.status;
    if (loginStatus === 301 || loginStatus === 302 || loginStatus === 307 || loginStatus === 308) {
      loginStatus = 200;
    }
  } catch {
    loginStatus = 0;
  }

  const apiOk = apiStatus >= 200 && apiStatus < 500 && oidcDiscoveryOk;
  const loginOk = loginStatus >= 200 && loginStatus < 500;

  return {
    reachable: loginOk && apiOk,
    apiDegraded: loginOk && !apiOk,
    apiStatus,
    loginStatus,
    oidcDiscoveryOk,
    message: !loginOk
      ? "Halaman authorize KYC Port tidak dapat diakses. Coba lagi nanti."
      : !apiOk
        ? "API OIDC KYC Port tidak merespons, sinkron profil/KYC bisa gagal sementara."
        : undefined,
  };
}

export function getKycPortServerConfig(): KycPortServerConfig {
  const apiBaseUrl = trimSlash(
    process.env.KYCPORT_API_BASE_URL
    || process.env.VITE_KYCPORT_API_BASE_URL
    || DEFAULT_KYCPORT_API,
  );

  return {
    apiBaseUrl,
    clientId: process.env.KYCPORT_CLIENT_ID || process.env.VITE_KYCPORT_CLIENT_ID || "",
    redirectUri:
      process.env.KYCPORT_REDIRECT_URI
      || process.env.VITE_KYCPORT_REDIRECT_URI
      || DEFAULT_KYCPORT_REDIRECT_URI,
    paths: {
      oidcToken: ensureSlash(process.env.KYCPORT_OIDC_TOKEN_PATH || "/oidc/token/"),
      oidcUserinfo: ensureSlash(process.env.KYCPORT_OIDC_USERINFO_PATH || "/oidc/userinfo/"),
      health: ensureSlash(process.env.KYCPORT_HEALTH_PATH || "/health"),
    },
  };
}

async function kycPortFetchJson<T>(
  path: string,
  opts: { method?: string; token?: string; query?: Record<string, string>; body?: unknown } = {},
): Promise<T> {
  const cfg = getKycPortServerConfig();
  const url = new URL(`${cfg.apiBaseUrl}${path}`);
  if (opts.query) {
    Object.entries(opts.query).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    let message = `KYCPORT API error (${res.status})`;
    try {
      const body = await res.json() as { message?: string; detail?: string; error?: string };
      message = body.detail || body.message || body.error || message;
    } catch { /* ignore */ }
    throw Object.assign(new Error(message), { status: res.status });
  }

  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

function kycPortClientSecret(): string {
  return process.env.KYCPORT_CLIENT_SECRET?.trim() || "";
}

function kycPortTenantApiKey(): string {
  return process.env.KYCPORT_TENANT_API_KEY?.trim() || "";
}

/** Server-to-server KYC status, @see GET /api/v1/kyc/{person_id}/status/ */
export async function fetchKycPortTenantStatus(personId: string) {
  const key = kycPortTenantApiKey();
  const id = personId.trim();
  if (!key || !id) return null;

  const cfg = getKycPortServerConfig();
  const url = `${cfg.apiBaseUrl}/v1/kyc/${encodeURIComponent(id)}/status/`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  return res.json() as Promise<{
    kyc_status?: string;
    kyc_tier?: string | number;
    aml_clear?: boolean;
  }>;
}

function mergeIdTokenKycIntoUser(
  user: Record<string, unknown>,
  idToken: string,
): Record<string, unknown> {
  const claims = extractKycClaimsFromIdToken(idToken);
  if (!claims) return user;
  return {
    ...user,
    ...(claims.sub ? { sub: claims.sub, id: claims.sub } : {}),
    ...(claims.email ? { email: claims.email } : {}),
    ...(claims.name ? { name: claims.name, full_name: claims.name } : {}),
    ...(claims.kyc_status ? { kyc_status: claims.kyc_status } : {}),
    ...(claims.kyc_tier != null ? { kyc_tier: claims.kyc_tier } : {}),
    ...(claims.aml_clear != null ? { aml_clear: claims.aml_clear } : {}),
  };
}

/** OIDC authorization_code + PKCE token exchange (POST form-urlencoded). */
export async function exchangeKycPortCodeServer(
  code: string,
  codeVerifier: string,
  redirectUri?: string,
  nonce?: string,
) {
  const cfg = getKycPortServerConfig();
  const secret = kycPortClientSecret();
  if (!cfg.clientId || !secret) {
    throw Object.assign(
      new Error("KYCPORT client_id / client_secret belum dikonfigurasi di server"),
      { status: 500 },
    );
  }

  let tokenUrl = `${cfg.apiBaseUrl}${cfg.paths.oidcToken}`;
  try {
    const discovery = await fetchKycPortOidcDiscovery();
    if (discovery.token_endpoint) tokenUrl = discovery.token_endpoint;
  } catch { /* use configured path */ }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri || cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: secret,
    code_verifier: codeVerifier,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    let message = `KYCPORT token exchange failed (${res.status})`;
    try {
      const errBody = await res.json() as { detail?: string; message?: string; error?: string };
      message = errBody.detail || errBody.message || errBody.error || message;
    } catch { /* ignore */ }
    throw Object.assign(new Error(message), { status: res.status });
  }

  const tokenPayload = await res.json() as Record<string, unknown>;
  const idToken = String(tokenPayload.id_token ?? "").trim();
  if (idToken) {
    validateKycPortIdTokenClaims(idToken, { clientId: cfg.clientId, nonce });
  }

  const accessToken = String(tokenPayload.access_token ?? tokenPayload.token ?? "").trim();
  if (!accessToken) {
    throw Object.assign(new Error("No access_token in OIDC token response"), { status: 502 });
  }

  let user: Record<string, unknown> = {};
  if (idToken) {
    user = mergeIdTokenKycIntoUser(user, idToken);
  }
  try {
    const profile = await fetchKycPortUserServer(accessToken);
    user = { ...profile, ...user };
  } catch {
    /* userinfo optional if id_token carries claims */
  }

  const normalized = normalizeKycPortUser(user);
  if (normalized.id && kycPortTenantApiKey()) {
    const tenantKyc = await fetchKycPortTenantStatus(normalized.id).catch(() => null);
    if (tenantKyc?.kyc_status) {
      user = {
        ...user,
        kyc_status: tenantKyc.kyc_status,
        kyc_tier: tenantKyc.kyc_tier,
        aml_clear: tenantKyc.aml_clear,
      };
    }
  }

  return { ...tokenPayload, user };
}

export async function fetchKycPortUserServer(token: string) {
  const cfg = getKycPortServerConfig();
  let userinfoPath = cfg.paths.oidcUserinfo;
  try {
    const discovery = await fetchKycPortOidcDiscovery();
    if (discovery.userinfo_endpoint) {
      const u = new URL(discovery.userinfo_endpoint);
      userinfoPath = u.pathname.endsWith("/") ? u.pathname : `${u.pathname}/`;
    }
  } catch { /* use configured path */ }
  return kycPortFetchJson<Record<string, unknown>>(userinfoPath, { token });
}

export async function fetchKycPortKycServer(token: string) {
  const profile = await fetchKycPortUserServer(token);
  return normalizeKycPortKyc(profile);
}

export function unwrapRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  if (o.user && typeof o.user === "object") return o.user as Record<string, unknown>;
  if (o.profile && typeof o.profile === "object") return o.profile as Record<string, unknown>;
  if (o.data && typeof o.data === "object") return unwrapRecord(o.data);
  return o;
}

export function normalizeKycPortUser(raw: unknown) {
  const u = unwrapRecord(raw);
  const id = String(u.id ?? u.sub ?? u.person_id ?? u.user_id ?? u.userId ?? "").trim();
  const kycStatus = String(
    u.kyc_status ?? u.kycStatus ?? u.status ?? "unverified",
  ).toLowerCase();

  return {
    id,
    email: String(u.email ?? ""),
    fullName: String(
      u.full_name ?? u.fullName ?? u.name ?? u.preferred_username ?? "KYCPort User",
    ),
    phone: String(u.phone ?? u.phone_number ?? ""),
    kycStatus,
    kycTier: parseKycTierValue(u.kyc_tier ?? u.kycTier ?? u.tier),
    verifiedAt: (u.verified_at ?? u.verifiedAt ?? null) as string | null,
    amlClear: typeof u.aml_clear === "boolean" ? u.aml_clear : null,
  };
}

export function normalizeKycPortKyc(raw: unknown) {
  const o = unwrapRecord(raw);
  const kyc = (o.kyc && typeof o.kyc === "object" ? o.kyc : o) as Record<string, unknown>;
  return {
    status: String(kyc.kyc_status ?? kyc.kycStatus ?? kyc.status ?? "unverified").toLowerCase(),
    tier: parseKycTierValue(kyc.kyc_tier ?? kyc.kycTier ?? kyc.tier),
    verifiedAt: (kyc.verified_at ?? kyc.verifiedAt ?? null) as string | null,
    amlClear: typeof kyc.aml_clear === "boolean" ? kyc.aml_clear : null,
  };
}
