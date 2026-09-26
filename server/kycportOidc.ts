/** OIDC helpers, @see https://www.kycport.com/api/oidc/.well-known/openid-configuration */

export const KYCPORT_ISSUER = "https://www.kycport.com";
const DISCOVERY_URL = `${KYCPORT_ISSUER}/api/oidc/.well-known/openid-configuration`;

export type KycPortOidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
};

export type KycPortIdTokenKycClaims = {
  sub?: string;
  email?: string;
  name?: string;
  kyc_status?: string;
  kyc_tier?: string | number;
  aml_clear?: boolean;
};

let discoveryCache: { doc: KycPortOidcDiscovery; at: number } | null = null;
const DISCOVERY_TTL_MS = 60 * 60 * 1000;

export async function fetchKycPortOidcDiscovery(): Promise<KycPortOidcDiscovery> {
  if (discoveryCache && Date.now() - discoveryCache.at < DISCOVERY_TTL_MS) {
    return discoveryCache.doc;
  }

  const res = await fetch(DISCOVERY_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`OIDC discovery failed (${res.status})`);
  }

  const doc = await res.json() as KycPortOidcDiscovery;
  discoveryCache = { doc, at: Date.now() };
  return doc;
}

/** Resolve authorize URL from OIDC discovery (never hardcode in production). */
export async function resolveKycPortAuthorizationEndpoint(
  fallback = `${KYCPORT_ISSUER}/authorize`,
): Promise<string> {
  try {
    const doc = await fetchKycPortOidcDiscovery();
    return doc.authorization_endpoint?.trim() || fallback;
  } catch {
    return fallback;
  }
}

type JwtPayload = Record<string, unknown>;

function decodeJwtPart(part: string): JwtPayload {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/");
  const json = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(json) as JwtPayload;
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    return decodeJwtPart(parts[1]!);
  } catch {
    return null;
  }
}

/** Validate iss, aud, exp, nonce on ID token (signature verified separately when JWKS available). */
export function validateKycPortIdTokenClaims(
  idToken: string,
  opts: { clientId: string; nonce?: string },
): void {
  const payload = decodeJwtPayload(idToken);
  if (!payload) throw new Error("Invalid ID token format");

  const iss = String(payload.iss ?? "");
  if (iss !== KYCPORT_ISSUER && iss !== `${KYCPORT_ISSUER}/`) {
    throw new Error(`Invalid token issuer: ${iss || "missing"}`);
  }

  const aud = payload.aud;
  const audList = Array.isArray(aud) ? aud.map(String) : [String(aud ?? "")];
  if (!audList.includes(opts.clientId)) {
    throw new Error("ID token audience mismatch");
  }

  const exp = Number(payload.exp ?? 0);
  if (!exp || exp * 1000 < Date.now() - 60_000) {
    throw new Error("ID token expired");
  }

  if (opts.nonce) {
    const tokenNonce = String(payload.nonce ?? "");
    if (!tokenNonce || tokenNonce !== opts.nonce) {
      throw new Error("ID token nonce mismatch");
    }
  }
}

/** KYC assurance from ID token when `kyc` scope was granted, @see kycport.com/docs */
export function extractKycClaimsFromIdToken(idToken: string): KycPortIdTokenKycClaims | null {
  const payload = decodeJwtPayload(idToken);
  if (!payload) return null;
  return {
    sub: String(payload.sub ?? "").trim() || undefined,
    email: String(payload.email ?? "").trim() || undefined,
    name: String(payload.name ?? payload.preferred_username ?? "").trim() || undefined,
    kyc_status: String(payload.kyc_status ?? "").trim().toLowerCase() || undefined,
    kyc_tier: payload.kyc_tier as string | number | undefined,
    aml_clear: typeof payload.aml_clear === "boolean" ? payload.aml_clear : undefined,
  };
}
