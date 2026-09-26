import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClientIp } from "./clientIp.js";
import { checkRateLimit } from "./rateLimit.js";

export function rateLimitOrRespond(
  req: VercelRequest,
  res: VercelResponse,
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const result = checkRateLimit(key, maxRequests, windowMs);
  if (result.ok) return false;
  res.status(429).json({
    error: "Too many requests",
    retryAfterSec: result.retryAfterSec,
  });
  return true;
}

export function rateLimitByIp(
  req: VercelRequest,
  res: VercelResponse,
  scope: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  return rateLimitOrRespond(req, res, `${scope}:ip:${getClientIp(req)}`, maxRequests, windowMs);
}
