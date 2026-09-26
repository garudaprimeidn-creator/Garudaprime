import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import {
  checkKycPortHealth,
  exchangeKycPortCodeServer,
  fetchKycPortKycServer,
  fetchKycPortUserServer,
  normalizeKycPortKyc,
  normalizeKycPortUser,
} from "../kycportCore.js";

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

function extractApiPath(req: VercelRequest): string {
  const queryPath = req.query.path;
  if (Array.isArray(queryPath) && queryPath.length) {
    return queryPath.filter(Boolean).join("/");
  }
  if (typeof queryPath === "string" && queryPath) {
    return queryPath;
  }

  const rawUrl = req.url ?? "";
  const pathname = rawUrl.split("?")[0] ?? "";
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const match = normalized.match(/^\/api\/?(.*)$/);
  return match?.[1] ?? "";
}

function routeSub(req: VercelRequest): string {
  const path = extractApiPath(req);
  return path.startsWith("kycport/") ? path.slice("kycport/".length) : "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  const sub = routeSub(req);

  try {
    if (req.method === "POST" && sub === "oauth/callback") {
      const body = req.body as {
        code?: string;
        codeVerifier?: string;
        redirectUri?: string;
        nonce?: string;
      };
      const code = String(body.code ?? "").trim();
      const codeVerifier = String(body.codeVerifier ?? "").trim();
      if (!code) {
        res.status(400).json({ error: "code required" });
        return;
      }
      const tokenPayload = await exchangeKycPortCodeServer(
        code,
        codeVerifier,
        body.redirectUri,
        body.nonce,
      );
      res.status(200).json(tokenPayload);
      return;
    }

    if (req.method === "GET" && sub === "me") {
      const token = bearerToken(req);
      if (!token) {
        res.status(401).json({ error: "Bearer token required" });
        return;
      }
      const raw = await fetchKycPortUserServer(token);
      res.status(200).json({ user: normalizeKycPortUser(raw), raw });
      return;
    }

    if (req.method === "GET" && sub === "kyc") {
      const token = bearerToken(req);
      if (!token) {
        res.status(401).json({ error: "Bearer token required" });
        return;
      }
      const raw = await fetchKycPortKycServer(token);
      res.status(200).json({ kyc: normalizeKycPortKyc(raw), raw });
      return;
    }

    if (req.method === "GET" && sub === "health") {
      const health = await checkKycPortHealth();
      res.status(200).json(health);
      return;
    }

    if (req.method === "GET" && sub === "sync") {
      const token = bearerToken(req);
      if (!token) {
        res.status(401).json({ error: "Bearer token required" });
        return;
      }
      const [userRaw, kycRaw] = await Promise.all([
        fetchKycPortUserServer(token).catch(() => ({})),
        fetchKycPortKycServer(token).catch(() => ({})),
      ]);
      const user = normalizeKycPortUser(userRaw);
      const kyc = normalizeKycPortKyc(kycRaw);
      res.status(200).json({
        user: {
          ...user,
          kycStatus: kyc.status || user.kycStatus,
          kycTier: kyc.tier || user.kycTier,
          verifiedAt: kyc.verifiedAt ?? user.verifiedAt,
        },
      });
      return;
    }

    res.status(404).json({ error: "Not found" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = typeof (e as { status?: number }).status === "number"
      ? (e as { status: number }).status
      : 500;
    res.status(status).json({ error: message });
  }
}
