#!/usr/bin/env node
/**
 * Point garudaprime.id nameservers to Vercel (fixes connection failed / SSL error).
 *
 * Requires Hostinger/Niagahoster API token:
 *   https://hpanel.hostinger.com/profile/api
 *
 * Usage:
 *   HOSTINGER_API_TOKEN=your_token npm run domains:fix
 *   npm run domains:fix -- --dry-run
 */
import { execSync } from "node:child_process";
import { DOMAIN_ROOT, APP_ORIGIN } from "./domain-config.mjs";

const VERCEL_NS = ["ns1.vercel-dns.com", "ns2.vercel-dns.com"];
const dryRun = process.argv.includes("--dry-run");

async function hostingerUpdateNameservers(token) {
  const url = `https://developers.hostinger.com/api/domains/v1/portfolio/${DOMAIN_ROOT}/nameservers`;
  const body = { ns1: VERCEL_NS[0], ns2: VERCEL_NS[1] };

  if (dryRun) {
    console.log("[dry-run] PUT", url, body);
    return { ok: true, dryRun: true };
  }

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`Hostinger API ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function printManualSteps() {
  console.log(`
Manual fix (Niagahoster / Hostinger panel):

  1. Login https://hpanel.hostinger.com (domain registrar: Niagahoster)
  2. Domains → garudaprime.id → DNS / Nameservers
  3. Change to Custom nameservers (EXACT spelling):

       ns1.vercel-dns.com
       ns2.vercel-dns.com

     NOT dns-vercel.com or dns-parking.com

  4. Save → wait 15 min, 24 hours for DNS propagation
  5. Verify: npm run domains:check

Temporary workaround (app works now):
  ${APP_ORIGIN}

Vercel dashboard:
  https://vercel.com/garuda-s-projects/garuda-prime-fintech-app/settings/domains
`);
}

async function main() {
  console.log(`Fix DNS for ${DOMAIN_ROOT}\n`);

  try {
    execSync("node scripts/check-domain-dns.mjs", { stdio: "inherit" });
  } catch {
    // check exits 1 when broken, expected
  }

  console.log("\n--- Fix attempt ---\n");

  const token = process.env.HOSTINGER_API_TOKEN?.trim();
  if (!token) {
    console.log("HOSTINGER_API_TOKEN not set, cannot auto-fix via API.\n");
    printManualSteps();
    process.exit(1);
  }

  try {
    const result = await hostingerUpdateNameservers(token);
    console.log("Hostinger nameserver update:", result);
    console.log("\nRequest accepted. Wait 15-60 min then run: npm run domains:check");
  } catch (err) {
    console.error("API fix failed:", err instanceof Error ? err.message : err);
    printManualSteps();
    process.exit(1);
  }
}

main();
