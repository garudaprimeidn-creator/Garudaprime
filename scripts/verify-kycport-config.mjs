#!/usr/bin/env node
/** Verify KYCPORT OAuth env + production SSO config endpoint. */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");

function loadEnv() {
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

const env = loadEnv();
const api = (env.VITE_PAY_HUB_API_URL || "https://app.garudaprime.id/api").replace(/\/$/, "");

console.log("=== KYCPORT Config Verify ===\n");

const clientId = env.VITE_KYCPORT_CLIENT_ID || env.KYCPORT_CLIENT_ID;
const secret = env.KYCPORT_CLIENT_SECRET;
const redirect = env.VITE_KYCPORT_REDIRECT_URI || env.KYCPORT_REDIRECT_URI;

console.log("Local env:");
console.log("  clientId:", clientId ? `${clientId.slice(0, 8)}…` : "MISSING");
console.log("  clientSecret:", secret ? "set (server)" : "MISSING");
console.log("  redirectUri:", redirect || "MISSING");

if (!clientId || !redirect) {
  console.error("\n✗ Fix .env.local: VITE_KYCPORT_CLIENT_ID + VITE_KYCPORT_REDIRECT_URI");
  process.exit(1);
}

const res = await fetch(`${api}/kycport/sso/config`);
const body = await res.json().catch(() => ({}));
console.log("\nProduction API GET /kycport/sso/config:");
console.log("  status:", res.status);
console.log("  oauthConfigured:", body.oauthConfigured);
console.log("  clientId:", body.clientId ? `${String(body.clientId).slice(0, 8)}…` : ", ");
console.log("  redirectUri:", body.redirectUri);

if (res.ok && body.oauthConfigured) {
  console.log("\n✓ KYCPORT OAuth ready");
} else {
  console.log("\n⚠ Sync env + redeploy: npm run main:env:sync && npm run deploy");
  process.exit(body.oauthConfigured ? 0 : 1);
}
