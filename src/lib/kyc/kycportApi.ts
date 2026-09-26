import { buildKycPortApiUrl, getKycPortConfig, getKycPortRedirectUri, isKycPortOAuthConfigured } from "./kycportConfig";
import { isPayHubApiConfigured } from "../payhub/payHubApi";

export type KycPortApiUser = {
  id?: string;
  sub?: string;
  email?: string;
  full_name?: string;
  fullName?: string;
  name?: string;
  phone?: string;
  phone_number?: string;
  kyc_status?: string;
  kycStatus?: string;
  status?: string;
  kyc_tier?: number;
  kycTier?: number;
  tier?: number;
  verified_at?: string;
  verifiedAt?: string;
};

export type KycPortTokenResponse = {
  access_token?: string;
  token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  id_token?: string;
  user?: KycPortApiUser;
};

export type KycPortVerificationSession = {
  session_id?: string;
  sessionId?: string;
  verification_url?: string;
  verificationUrl?: string;
  status?: string;
  tier?: number;
};

export class KycPortApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "KycPortApiError";
    this.code = code;
    this.status = status;
  }

  static async fromResponse(res: Response): Promise<KycPortApiError> {
    let code = "kycport/api-error";
    let message = `KYCPORT API error (${res.status})`;
    try {
      const body = await res.json() as {
        error?: string;
        message?: string;
        code?: string;
        detail?: string;
      };
      code = body.error || body.code || code;
      message = body.detail || body.message || message;
    } catch { /* ignore */ }
    return new KycPortApiError(message, code, res.status);
  }
}

function payHubBase(): string | null {
  return import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "") || null;
}

function unwrapRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  if (o.user && typeof o.user === "object") return o.user as Record<string, unknown>;
  if (o.profile && typeof o.profile === "object") return o.profile as Record<string, unknown>;
  if (o.data && typeof o.data === "object") return unwrapRecord(o.data);
  return o;
}

const apiFetch = async <T>(
  path: string,
  opts: { method?: string; token?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> => {
  const cfg = getKycPortConfig();
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
      ...(cfg.clientId ? { "X-Client-Id": cfg.clientId } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw await KycPortApiError.fromResponse(res);
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
};

async function proxyFetch<T>(
  subPath: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const base = payHubBase();
  if (!base) throw new KycPortApiError("Pay Hub API not configured", "kycport/no-proxy", 503);

  const res = await fetch(`${base}/kycport/${subPath}`, {
    method: opts.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) throw await KycPortApiError.fromResponse(res);
  return res.json() as Promise<T>;
}

export type KycPortOAuthServerConfig = {
  clientId: string;
  redirectUri: string;
  loginUrl: string;
  authorizeUrl?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  oauthEntryUrl?: string;
  oauthConfigured: boolean;
  scopes?: string;
  appName?: string;
  partnerId?: string;
};

export const fetchKycPortOAuthConfig = async (): Promise<KycPortOAuthServerConfig | null> => {
  const base = payHubBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/kycport/sso/config`);
    if (!res.ok) return null;
    return res.json() as Promise<KycPortOAuthServerConfig>;
  } catch {
    return null;
  }
};

/** Check server + client, OAuth only works when KYCPORT client_id is registered. */
export const resolveKycPortOAuthReady = async (): Promise<boolean> => {
  if (isKycPortOAuthConfigured()) return true;
  const serverCfg = await fetchKycPortOAuthConfig().catch(() => null);
  return Boolean(serverCfg?.oauthConfigured);
};

export type KycPortReachability = {
  reachable: boolean;
  apiDegraded: boolean;
  apiStatus: number;
  loginStatus: number;
  message?: string;
};

/** Server-side probe, blocks OAuth when KYC Port API/status is down (504). */
export const fetchKycPortReachability = async (): Promise<KycPortReachability> => {
  const base = payHubBase();
  if (base) {
    try {
      const res = await fetch(`${base}/kycport/health`, { cache: "no-store" });
      if (res.ok) {
        return res.json() as Promise<KycPortReachability>;
      }
    } catch {
      /* fall through */
    }
  }

  try {
    await checkKycPortHealth();
    return { reachable: true, apiDegraded: false, apiStatus: 200, loginStatus: 200 };
  } catch (e) {
    const status = e instanceof KycPortApiError ? e.status : 0;
    return {
      reachable: false,
      apiDegraded: false,
      apiStatus: status,
      loginStatus: 0,
      message: e instanceof Error ? e.message : "KYC Port tidak tersedia",
    };
  }
};

/** Block only when OAuth login page is down, API 502 alone still allows opening KYC Port. */
export const assertKycPortReachable = async (): Promise<KycPortReachability> => {
  const health = await fetchKycPortReachability();
  if (!health.reachable) {
    throw Object.assign(
      new Error(
        health.message
        || "Halaman login KYC Port tidak dapat diakses. Coba lagi nanti.",
      ),
      { code: "kycport/unavailable", status: health.loginStatus || health.apiStatus },
    );
  }
  return health;
};

export const checkKycPortHealth = () =>
  apiFetch<{ status: string; service?: string }>(getKycPortConfig().paths.health);

function parseKycTierValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value ?? "").trim().toLowerCase();
  const tierMatch = s.match(/^t(\d)$/);
  if (tierMatch) return Number(tierMatch[1]);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export const exchangeKycPortCode = async (
  code: string,
  codeVerifier: string,
  redirectUri?: string,
  nonce?: string,
): Promise<KycPortTokenResponse> => {
  const cfg = getKycPortConfig();
  const resolvedRedirect = redirectUri || cfg.redirectUri || getKycPortRedirectUri();

  if (!isPayHubApiConfigured()) {
    throw new KycPortApiError(
      "Token exchange harus melalui server (BFF). Konfigurasi VITE_PAY_HUB_API_URL.",
      "kycport/no-bff",
      503,
    );
  }

  return proxyFetch<KycPortTokenResponse>("oauth/callback", {
    method: "POST",
    body: { code, codeVerifier, redirectUri: resolvedRedirect, nonce },
  });
};

export const fetchKycPortUser = async (token: string) => {
  if (isPayHubApiConfigured()) {
    const data = await proxyFetch<{ user: KycPortApiUser }>("me", { token });
    return data.user ?? (data as unknown as KycPortApiUser);
  }
  return apiFetch<KycPortApiUser>(getKycPortConfig().paths.oidcUserinfo, { token });
};

export const fetchKycPortStatus = async (token: string) => {
  if (isPayHubApiConfigured()) {
    const data = await proxyFetch<{ kyc: { status: string; tier?: number; verifiedAt?: string | null } }>(
      "kyc",
      { token },
    );
    const kyc = data.kyc ?? { status: "pending" };
    return {
      status: kyc.status,
      tier: kyc.tier,
      verified_at: kyc.verifiedAt ?? undefined,
    };
  }

  const cfg = getKycPortConfig();
  try {
    const raw = await apiFetch<unknown>(cfg.paths.oidcUserinfo, { token });
    return normalizeKycStatusPayload(raw);
  } catch {
    const profile = await fetchKycPortUser(token);
    return {
      status: profile.kycStatus ?? profile.kyc_status ?? profile.status ?? "pending",
      tier: parseKycTierValue(profile.kycTier ?? profile.kyc_tier ?? profile.tier),
      verified_at: profile.verifiedAt ?? profile.verified_at,
    };
  }
};

/** Combined profile + KYC from server proxy (preferred). */
export const fetchKycPortSync = async (token: string) => {
  if (isPayHubApiConfigured()) {
    const data = await proxyFetch<{ user: ReturnType<typeof normalizeKycPortUser> }>("sync", { token });
    return data.user;
  }

  const [profileRaw, kyc] = await Promise.all([
    fetchKycPortUser(token),
    fetchKycPortStatus(token).catch(() => null),
  ]);
  const profile = normalizeKycPortUser(profileRaw);
  return {
    ...profile,
    kycStatus: kyc?.status ?? profile.kycStatus,
    kycTier: kyc?.tier ?? profile.kycTier,
    verifiedAt: kyc?.verified_at ?? profile.verifiedAt,
  };
};

export const logoutKycPort = async (_token: string) => {
  /* KYCPort OIDC has no client-side logout endpoint, clear local session only */
};

export const getKycPortVerificationSession = async (token: string, sessionId: string) => {
  const synced = await fetchKycPortSync(token);
  return {
    session_id: sessionId,
    status: synced.kycStatus,
    tier: synced.kycTier,
  };
};

export const extractAccessToken = (raw: KycPortTokenResponse) =>
  raw.access_token ?? raw.token ?? "";

function normalizeKycStatusPayload(raw: unknown) {
  const o = unwrapRecord(raw);
  const kyc = (o.kyc && typeof o.kyc === "object" ? o.kyc : o) as Record<string, unknown>;
  return {
    status: String(kyc.kyc_status ?? kyc.kycStatus ?? kyc.status ?? "unverified").toLowerCase(),
    tier: parseKycTierValue(kyc.kyc_tier ?? kyc.kycTier ?? kyc.tier),
    verified_at: (kyc.verified_at ?? kyc.verifiedAt) as string | undefined,
  };
}

export const normalizeKycPortUser = (raw: KycPortApiUser | Record<string, unknown>) => {
  const u = unwrapRecord(raw) as KycPortApiUser & { user_id?: string; userId?: string };
  const id = String(u.id ?? u.sub ?? u.user_id ?? u.userId ?? "").trim();
  const email = String(u.email ?? "").trim();
  return {
    id: id || email,
    email,
    fullName: String(u.fullName ?? u.full_name ?? u.name ?? "KYCPort User"),
    phone: String(u.phone ?? u.phone_number ?? ""),
    kycStatus: String(u.kycStatus ?? u.kyc_status ?? u.status ?? "unverified").toLowerCase(),
    kycTier: parseKycTierValue(u.kycTier ?? u.kyc_tier ?? u.tier),
    verifiedAt: (u.verifiedAt ?? u.verified_at) as string | undefined,
  };
};

export const normalizeVerificationSession = (raw: KycPortVerificationSession) => ({
  sessionId: raw.sessionId ?? raw.session_id ?? `kyc_${Date.now()}`,
  verificationUrl: raw.verificationUrl ?? raw.verification_url,
  status: (raw.status ?? "pending").toLowerCase(),
  tier: raw.tier ?? 3,
});

export { buildKycPortApiUrl };
