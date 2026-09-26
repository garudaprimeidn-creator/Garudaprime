import type { VercelResponse } from "@vercel/node";

const DEFAULT_ORIGINS = [
  "https://app.garudaprime.id",
  "https://garudaprime.id",
  "https://www.garudaprime.id",
];

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_CORS_ORIGINS ?? DEFAULT_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

export const resolveCorsOrigin = (originHeader?: string | null) => {
  if (!originHeader) return null;
  if (ALLOWED_ORIGINS.has(originHeader)) return originHeader;
  if (process.env.NODE_ENV !== "production" && originHeader.startsWith("http://localhost")) {
    return originHeader;
  }
  return null;
};

export const applyCors = (res: VercelResponse, originHeader?: string | null) => {
  const origin = resolveCorsOrigin(originHeader);
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Token, X-Garuda-Device-Id");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(self)");
};

export const handleOptions = (method: string | undefined, res: VercelResponse, originHeader?: string | null) => {
  if (method === "OPTIONS") {
    applyCors(res, originHeader);
    res.status(204).end();
    return true;
  }
  return false;
};
