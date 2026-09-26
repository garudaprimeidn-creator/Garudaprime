#!/usr/bin/env node
/**
 * Sync APK version/size metadata for marketing page from TWA manifest + built APK.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const twaPath = resolve(root, "twa/twa-manifest.json");
const apkPath = resolve(root, "public/downloads/garuda-prime.apk");
const outPath = resolve(root, "public/apk-meta.json");

function formatApkSize(bytes) {
  if (bytes >= 1_048_576) return `~${(bytes / 1_048_576).toFixed(1)} MB`;
  return `~${Math.round(bytes / 1024)} KB`;
}

const twa = JSON.parse(readFileSync(twaPath, "utf8"));
const version = twa.appVersionName ?? twa.appVersion ?? "1.0.0";
const packageId = twa.packageId ?? "id.garudaprime.app";
let sizeLabel = "~2.1 MB";
if (existsSync(apkPath)) {
  sizeLabel = formatApkSize(readFileSync(apkPath).length);
}

const copyKey = `v${version}|${packageId}|${sizeLabel}`;
const display = `v${version} / ${packageId} / ${sizeLabel}`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  `${JSON.stringify({ version, packageId, sizeLabel, copyKey, display, updatedAt: new Date().toISOString() }, null, 2)}\n`,
);

const marketingHtml = resolve(root, "public/marketing/index.html");
if (existsSync(marketingHtml)) {
  let html = readFileSync(marketingHtml, "utf8");
  const fallback = `v${version} / ${packageId} / ${sizeLabel}`;
  html = html.replace(
    /id="apk-meta-line"[^>]*>[^<]*/,
    `id="apk-meta-line" data-i18n="getAppApkMeta" data-i18n-tagline>${fallback}`,
  );
  html = html.replace(
    /href="https:\/\/garudaprime\.id\/downloads\/garuda-prime\.apk[^"]*"/g,
    `href="https://garudaprime.id/downloads/garuda-prime.apk?v=${version}"`,
  );
  writeFileSync(marketingHtml, html);
}

console.log(`✓ apk meta ${display}`);
