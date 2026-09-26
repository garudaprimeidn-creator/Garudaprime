#!/usr/bin/env node
/**
 * Regenerate PWA / favicon assets from emblem masters.
 * Favicons: circular badge (not square) with page-matched circle fill.
 * PWA install icons: square charcoal canvas for Android/iOS launchers.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  APP_PAGE_BG,
  MARKETING_PAGE_BG,
  removeNearWhiteBackground,
  renderCircularIconOnBackground,
  renderIconOnBackground,
  renderIconWithSafeZone,
  SPLASH_BG,
  stripLogoMatte,
} from "./logo-utils.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const publicDir = path.join(root, "public");
const marketingDir = path.join(publicDir, "marketing");
const assetsDir = path.join(root, "src/assets");

const darkMaster = path.join(assetsDir, "garuda-prime-icon.master.png");
const darkFallback = path.join(assetsDir, "garuda-prime-icon.png");
const lightMaster = path.join(assetsDir, "garuda-prime-icon-light.master.png");
const lightFallback = path.join(assetsDir, "garuda-prime-icon-light.png");
const emblemFallback = path.join(assetsDir, "garuda-prime-emblem.png");
const marketingMaster = path.join(marketingDir, "garuda-prime-marketing.master.png");

function resolveInput(...candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const darkInput = resolveInput(darkMaster, darkFallback);
const lightInput = resolveInput(lightMaster, lightFallback, emblemFallback);

if (!lightInput && !darkInput && !fs.existsSync(marketingMaster)) {
  console.error("Missing icon masters, run: npm run icons:process");
  process.exit(1);
}

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(marketingDir, { recursive: true });

if (darkInput && !fs.existsSync(darkMaster) && darkInput === darkFallback) {
  fs.copyFileSync(darkFallback, darkMaster);
}

async function buildPipeline(input) {
  const stripped = await stripLogoMatte(input);
  const trimmed = await stripped
    .clone()
    .trim({ threshold: 8 })
    .png()
    .toBuffer();
  return sharp(trimmed).sharpen({ sigma: 0.6, m1: 0.5, m2: 0.35 });
}

async function buildMarketingFaviconPipeline() {
  const source = fs.existsSync(marketingMaster) ? marketingMaster : lightInput ?? darkInput;
  if (!source) return null;
  const whiteStripped = await removeNearWhiteBackground(
    await sharp(source).ensureAlpha().png().toBuffer(),
  );
  const trimmed = await whiteStripped.clone().trim({ threshold: 12 }).png().toBuffer();
  return sharp(trimmed).sharpen({ sigma: 0.55, m1: 0.48, m2: 0.32 });
}

const lightPipeline = lightInput ? await buildPipeline(lightInput) : null;
const darkPipeline = darkInput ? await buildPipeline(darkInput) : null;
const emblemPipeline = darkPipeline ?? lightPipeline ?? (await buildMarketingFaviconPipeline());
const marketingFaviconPipeline = (await buildMarketingFaviconPipeline()) ?? emblemPipeline;

const APP_FAVICONS = [
  { name: "favicon-32.png", size: 32, inset: 0.14 },
  { name: "favicon.png", size: 512, inset: 0.14 },
  { name: "apple-touch-icon.png", size: 180, inset: 0.15 },
];

const APP_PWA_ICONS = [
  { name: "icon-192.png", size: 192, inset: 0.14 },
  { name: "icon-512.png", size: 512, inset: 0.14 },
  { name: "icon-512-maskable.png", size: 512, inset: 0.2 },
  { name: "icon-1024.png", size: 1024, inset: 0.14 },
];

const MARKETING_FAVICONS = [
  { name: "favicon-32.png", size: 32, inset: 0.14 },
  { name: "favicon.png", size: 512, inset: 0.14 },
  { name: "apple-touch-icon.png", size: 180, inset: 0.15 },
];

const ASSET_SIZES = [
  { name: "garuda-prime-icon-light.png", size: 512, light: true, inset: 0.12 },
  { name: "garuda-prime-icon-light@2x.png", size: 1024, light: true, inset: 0.12 },
  { name: "garuda-prime-icon.png", size: 512, light: false, inset: 0.12 },
  { name: "garuda-prime-icon@2x.png", size: 1024, light: false, inset: 0.12 },
];

async function renderCircularFavicon(pipeline, size, out, background, insetRatio) {
  await (await renderCircularIconOnBackground(pipeline, size, background, { insetRatio })).toFile(out);
}

async function renderPublicIcon(pipeline, size, out, background, insetRatio) {
  await (await renderIconOnBackground(pipeline, size, background, { insetRatio })).toFile(out);
}

async function renderAssetIcon(pipeline, size, out, insetRatio) {
  await (await renderIconWithSafeZone(pipeline, size, { insetRatio })).toFile(out);
}

for (const { name, size, inset } of APP_FAVICONS) {
  const out = path.join(publicDir, name);
  await renderCircularFavicon(emblemPipeline, size, out, APP_PAGE_BG, inset);
  console.log(`✓ ${path.relative(root, out)} (${size}px, circle #04090f)`);
}

for (const { name, size, inset } of APP_PWA_ICONS) {
  const out = path.join(publicDir, name);
  await renderPublicIcon(emblemPipeline, size, out, SPLASH_BG, inset);
  console.log(`✓ ${path.relative(root, out)} (${size}px, square #141414)`);
}

for (const { name, size, inset } of MARKETING_FAVICONS) {
  const out = path.join(marketingDir, name);
  await renderCircularFavicon(marketingFaviconPipeline, size, out, MARKETING_PAGE_BG, inset);
  console.log(`✓ ${path.relative(root, out)} (${size}px, circle #ffffff)`);
}

for (const { name, size, light, inset } of ASSET_SIZES) {
  const out = path.join(assetsDir, name);
  const pipeline = light ? lightPipeline : darkPipeline;
  if (!pipeline) continue;
  await renderAssetIcon(pipeline, size, out, inset);
  console.log(`✓ ${path.relative(root, out)} (${size}px, transparent)`);
}

const manifest = {
  name: "Garuda Prime",
  short_name: "Garuda Prime",
  description: "Syariah Web3 Fintech, Garuda Prime",
  start_url: "/",
  display: "standalone",
  background_color: "#141414",
  theme_color: "#141414",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    {
      src: "/icon-512-maskable.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};

fs.writeFileSync(
  path.join(publicDir, "manifest.webmanifest"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log("✓ public/manifest.webmanifest");
