#!/usr/bin/env node
/**
 * Quick DNS/SSL check for garudaprime.id production domains.
 * Run: node scripts/check-domain-dns.mjs
 */
import { execSync } from "node:child_process";
import { DOMAIN_ROOT, APP_ORIGIN } from "./domain-config.mjs";

const HOSTS = [
  { host: DOMAIN_ROOT, expect: "vercel" },
  { host: `www.${DOMAIN_ROOT}`, expect: "vercel" },
  { host: `app.${DOMAIN_ROOT}`, expect: "vercel" },
  { host: `admin.${DOMAIN_ROOT}`, expect: "vercel" },
];

const VERCEL_IPS = new Set(["76.76.21.21", "76.76.21.123", "66.33.60.35", "64.29.17.1", "216.198.79.1"]);

function dig(name, type) {
  try {
    return execSync(`dig +short ${name} ${type}`, { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function curlStatus(url) {
  try {
    const out = execSync(`curl -sI --max-time 12 "${url}" 2>&1 | head -1`, { encoding: "utf8" }).trim();
    return out || "no response";
  } catch (e) {
    return String(e.message ?? e).split("\n")[0];
  }
}

function looksLikeVercel(records) {
  const joined = records.join(" ").toLowerCase();
  if (joined.includes("vercel-dns")) return true;
  return records.some((r) => VERCEL_IPS.has(r.trim()));
}

console.log("Garuda Prime domain check\n");

let failed = 0;
for (const { host, expect } of HOSTS) {
  const a = dig(host, "A");
  const cname = dig(host, "CNAME");
  const https = curlStatus(`https://${host}/`);
  const ok = expect === "vercel" ? looksLikeVercel([...a, ...cname]) : true;
  const sslOk = https.startsWith("HTTP/");

  console.log(`,  ${host}`);
  console.log(`  A:     ${a.join(", ") || "(none)"}`);
  console.log(`  CNAME: ${cname.join(", ") || "(none)"}`);
  console.log(`  HTTPS: ${https}`);
  if (!ok || !sslOk) {
    console.log(`  ✘ FAIL, expected Vercel + valid HTTPS`);
    failed += 1;
  } else {
    console.log(`  ✓ OK`);
  }
  console.log("");
}

console.log("Nameservers (garudaprime.id):");
console.log(`  ${dig(DOMAIN_ROOT, "NS").join("\n  ") || "(none)"}`);
console.log("");
console.log("Expected Vercel nameservers: ns1.vercel-dns.com, ns2.vercel-dns.com");
console.log(`Or A record @ → 76.76.21.21 and app → CNAME to cname.vercel-dns.com`);
console.log(`App URL (always use for OAuth/KYC): ${APP_ORIGIN}`);

process.exit(failed > 0 ? 1 : 0);
