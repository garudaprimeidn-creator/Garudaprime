#!/usr/bin/env node
/**
 * Writes build version for PWA cache busting + auto-update checks.
 * Run before vite build.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const version = String(Date.now());
const builtAt = new Date().toISOString();

const payload = { version, builtAt };

fs.writeFileSync(
  path.join(root, "public/app-version.json"),
  `${JSON.stringify(payload, null, 2)}\n`,
);

const manifestPath = path.join(root, "public/manifest.webmanifest");
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.start_url = `https://app.garudaprime.id/?v=${version}`;
  manifest.scope = "https://app.garudaprime.id/";
  if (Array.isArray(manifest.icons)) {
    manifest.icons = manifest.icons.map((icon) => ({
      ...icon,
      src: icon.src.split("?")[0] + `?v=${version}`,
    }));
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Keep static boot / OAuth overlay logos aligned with bundled auth assets. */
const splashPairs = [
  ["src/assets/garuda-prime-splash.png", "public/splash-logo.png"],
  ["src/assets/garuda-prime-splash@2x.png", "public/splash-logo@2x.png"],
];
for (const [fromRel, toRel] of splashPairs) {
  const from = path.join(root, fromRel);
  const to = path.join(root, toRel);
  if (!fs.existsSync(from)) {
    console.warn(`⚠ skip splash sync, missing ${fromRel}`);
    continue;
  }
  fs.copyFileSync(from, to);
  console.log(`✓ synced ${toRel}`);
}

const marketingHtmlPath = path.join(root, "public/marketing/index.html");
if (fs.existsSync(marketingHtmlPath)) {
  let html = fs.readFileSync(marketingHtmlPath, "utf8");
  html = html
    .replace(/(\/marketing\/garuda-prime-icon\.png)(\?v=[^"'\s]*)?/g, `$1?v=${version}`)
    .replace(/(\/marketing\/og-share\.jpg)(\?v=[^"'\s]*)?/g, `$1?v=${version}`)
    .replace(/(\/marketing\/favicon-32\.png)(\?v=[^"'\s]*)?/g, `$1?v=${version}`)
    .replace(/(\/marketing\/favicon\.png)(\?v=[^"'\s]*)?/g, `$1?v=${version}`)
    .replace(/(\/marketing\/apple-touch-icon\.png)(\?v=[^"'\s]*)?/g, `$1?v=${version}`)
    .replace(/(\/marketing\/garuda-prime-icon-footer\.png)(\?v=[^"'\s]*)?/g, `$1?v=${version}`);
  fs.writeFileSync(marketingHtmlPath, html);
  console.log("✓ marketing asset cache bust");
}

console.log(`✓ app version ${version}`);
