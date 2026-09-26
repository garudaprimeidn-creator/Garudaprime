#!/usr/bin/env node
/**
 * Generate social / referral link preview image (Open Graph 1200×630).
 * App OG: brand master. Marketing OG: marketing master (garudaprime.id only).
 * Usage: node scripts/generate-og-share.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { removeNearWhiteBackground, stripLogoMatte } from "./logo-utils.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const assetsDir = path.join(root, "src/assets");
const publicDir = path.join(root, "public");
const marketingDir = path.join(publicDir, "marketing");

const OG_W = 1200;
const OG_H = 630;

const brandMaster = path.join(assetsDir, "garuda-prime-brand.master.png");
const brandFallback = path.join(assetsDir, "garuda-prime-brand-dark@2x.png");
const brandSource = fs.existsSync(brandMaster) ? brandMaster : brandFallback;
const marketingMaster = path.join(marketingDir, "garuda-prime-marketing.master.png");

if (!fs.existsSync(brandSource)) {
  console.error("Missing brand source for OG image");
  process.exit(1);
}

const bgSvg = Buffer.from(`<svg width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#04090f"/>
      <stop offset="48%" stop-color="#0b1629"/>
      <stop offset="100%" stop-color="#04090f"/>
    </linearGradient>
    <radialGradient id="emerald" cx="50%" cy="38%" r="42%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gold" cx="50%" cy="38%" r="28%">
      <stop offset="0%" stop-color="#d4af37" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#d4af37" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#emerald)"/>
  <rect width="100%" height="100%" fill="url(#gold)"/>
</svg>`);

async function logoBufferFromPipeline(pipeline, logoWidth) {
  return pipeline
    .clone()
    .resize(logoWidth, logoWidth, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
}

async function renderOgShare(logo, outputs, { logoTopOffset = 24 } = {}) {
  const meta = await sharp(logo).metadata();
  const logoW = meta.width ?? OG_W;
  const logoH = meta.height ?? OG_W;
  const logoLeft = Math.max(0, Math.round((OG_W - logoW) / 2));
  const logoTop = Math.max(0, Math.round((OG_H - logoH) / 2) - logoTopOffset);
  const background = await sharp(bgSvg).resize(OG_W, OG_H).png().toBuffer();

  for (const out of outputs) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const pipeline = sharp(background).composite([{ input: logo, left: logoLeft, top: logoTop }]);
    if (out.endsWith(".jpg")) {
      await pipeline.jpeg({ quality: 92, mozjpeg: true }).toFile(out);
    } else {
      await pipeline.png({ compressionLevel: 8, adaptiveFiltering: true }).toFile(out);
    }
    const stat = fs.statSync(out);
    console.log(`✓ ${path.relative(root, out)} (${Math.round(stat.size / 1024)} KB)`);
  }
}

const brandMatte = await stripLogoMatte(brandSource, { blackCutoff: 24, darkMatteLuma: 40 });
const brandLogo = await logoBufferFromPipeline(brandMatte, 580);
await renderOgShare(brandLogo, [
  path.join(publicDir, "og-share.jpg"),
  path.join(publicDir, "og-share.png"),
]);

if (fs.existsSync(marketingMaster)) {
  const whiteStripped = await removeNearWhiteBackground(
    await sharp(marketingMaster).ensureAlpha().png().toBuffer(),
  );
  const marketingPipeline = sharp(
    await whiteStripped
      .clone()
      .trim({ threshold: 12 })
      .png()
      .toBuffer(),
  ).sharpen({ sigma: 0.55, m1: 0.48, m2: 0.32 });
  const marketingLogo = await logoBufferFromPipeline(marketingPipeline, 520);
  await renderOgShare(marketingLogo, [
    path.join(marketingDir, "og-share.jpg"),
    path.join(marketingDir, "og-share.png"),
  ], { logoTopOffset: 20 });
}
