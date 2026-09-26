import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import {
  DEFAULT_KYCPORT_AUTHORIZE,
  getKycPortServerConfig,
} from "../kycportCore.js";
import {
  fetchKycPortOidcDiscovery,
  resolveKycPortAuthorizationEndpoint,
} from "../kycportOidc.js";

const trimSlash = (url: string) => url.replace(/\/+$/, "");

const DEFAULT_APP_ORIGIN = "https://app.garudaprime.id";
const DEFAULT_REDIRECT_URI = `${DEFAULT_APP_ORIGIN}/auth/kycport/callback`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const cfg = getKycPortServerConfig();
  const appOrigin = (
    process.env.KYCPORT_APP_ORIGIN
    || DEFAULT_APP_ORIGIN
  ).replace(/\/+$/, "");

  const redirectUri = trimSlash(
    process.env.KYCPORT_REDIRECT_URI
    || process.env.VITE_KYCPORT_REDIRECT_URI
    || cfg.redirectUri
    || DEFAULT_REDIRECT_URI,
  );

  const authorizeUrl = trimSlash(
    await resolveKycPortAuthorizationEndpoint(
      process.env.KYCPORT_OAUTH_ENTRY_URL
      || process.env.VITE_KYCPORT_OAUTH_ENTRY_URL
      || process.env.KYCPORT_LOGIN_URL
      || process.env.VITE_KYCPORT_LOGIN_URL
      || process.env.KYCPORT_AUTHORIZE_URL
      || process.env.VITE_KYCPORT_AUTHORIZE_URL
      || DEFAULT_KYCPORT_AUTHORIZE,
    ),
  );

  let discovery: Awaited<ReturnType<typeof fetchKycPortOidcDiscovery>> | null = null;
  try {
    discovery = await fetchKycPortOidcDiscovery();
  } catch { /* optional */ }

  res.status(200).json({
    clientId: cfg.clientId,
    redirectUri,
    allowedRedirectUris: [
      DEFAULT_REDIRECT_URI,
      `${appOrigin}/auth/kycport/callback`
    ],
    loginUrl: authorizeUrl,
    authorizeUrl,
    authorizationEndpoint: discovery?.authorization_endpoint ?? authorizeUrl,
    tokenEndpoint: discovery?.token_endpoint ?? `${cfg.apiBaseUrl}/oidc/token/`,
    userinfoEndpoint: discovery?.userinfo_endpoint ?? `${cfg.apiBaseUrl}/oidc/userinfo/`,
    jwksUri: discovery?.jwks_uri ?? `${cfg.apiBaseUrl}/oidc/jwks/`,
    oauthEntryUrl: authorizeUrl,
    oauthConfigured: Boolean(
      cfg.clientId
      && redirectUri
      && (process.env.KYCPORT_CLIENT_SECRET?.trim() || ""),
    ),
    scopes: process.env.KYCPORT_SCOPES || process.env.VITE_KYCPORT_SCOPES || "openid email kyc",
    appName: process.env.KYCPORT_APP_NAME || process.env.VITE_KYCPORT_APP_NAME || "Garuda Prime",
    appOrigin: DEFAULT_APP_ORIGIN,
    partnerId: process.env.KYCPORT_PARTNER_ID || process.env.VITE_KYCPORT_PARTNER_ID || "garudaprime",
    apiBaseUrl: cfg.apiBaseUrl,
    oidcDiscovery: `${cfg.apiBaseUrl}/oidc/.well-known/openid-configuration`,
  });
}
