#!/usr/bin/env node
/**
 * Write public/.well-known/assetlinks.json from TWA_SHA256_FINGERPRINT env.
 *
 * Usage:
 *   TWA_SHA256_FINGERPRINT="AA:BB:..." npm run twa:assetlinks
 *   # or comma-separated for upload + Play App Signing keys:
 *   TWA_SHA256_FINGERPRINT="AA:BB:...,CC:DD:..." npm run twa:assetlinks
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = resolve(root, "public/.well-known");
const outFile = resolve(outDir, "assetlinks.json");

const packageName = process.env.TWA_PACKAGE_ID ?? "id.garudaprime.app";
const raw = process.env.TWA_SHA256_FINGERPRINT?.trim();

if (!raw) {
  console.error("Set TWA_SHA256_FINGERPRINT (colon-separated SHA-256 cert fingerprint).");
  console.error("Run: npm run twa:fingerprint");
  process.exit(1);
}

const fingerprints = raw
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const payload = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: packageName,
      sha256_cert_fingerprints: fingerprints,
    },
  },
];

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`✓ wrote ${outFile}`);
console.log(`  package: ${packageName}`);
console.log(`  fingerprints: ${fingerprints.length}`);
