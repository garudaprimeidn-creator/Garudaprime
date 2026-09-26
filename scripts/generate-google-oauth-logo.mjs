#!/usr/bin/env node
/**
 * Generate 120×120 OAuth consent / account-picker logo for Google Cloud Branding.
 * Square emblem on #141414, matches Google account picker dark UI.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { renderIconOnBackground, SPLASH_BG, stripLogoMatte } from "./logo-utils.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const assetsDir = path.join(root, "src/assets");
const outDir = path.join(root, "public/branding");

const candidates = [
  path.join(assetsDir, "garuda-prime-icon.master.png"),
  path.join(assetsDir, "garuda-prime-brand.master.png"),
  path.join(assetsDir, "garuda-prime-emblem.png"),
  path.join(assetsDir, "garuda-prime-splash.png"),
];

const source = candidates.find((p) => fs.existsSync(p));
if (!source) {
  console.error("Missing emblem master, run: npm run icons:process");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const pipeline = await stripLogoMatte(source);
const trimmed = await pipeline.clone().trim({ threshold: 8 }).png().toBuffer();
const emblem = sharp(trimmed).sharpen({ sigma: 0.55, m1: 0.48, m2: 0.32 });

const sizes = [
  { name: "google-oauth-logo-120.png", size: 120, inset: 0.12 },
  { name: "google-oauth-logo-512.png", size: 512, inset: 0.12 },
];

for (const { name, size, inset } of sizes) {
  const out = path.join(outDir, name);
  await (await renderIconOnBackground(emblem, size, SPLASH_BG, { insetRatio: inset })).toFile(out);
  console.log(`✓ ${path.relative(root, out)} (${size}px, #141414)`);
}
