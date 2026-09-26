#!/usr/bin/env node
/**
 * Sync Garuda Prime marketing logos for garudaprime.id (marketing page only).
 * Nav + hero: white-background master as-is.
 * Footer: emblem on #0f172a to match footer canvas.
 * Also regenerates marketing favicons + og-share preview.
 * Usage: node scripts/sync-marketing-logo.mjs [path-to-white-bg-logo.png]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  MARKETING_FOOTER_BG,
  MARKETING_PAGE_BG,
  removeNearWhiteBackground,
  renderCircularIconOnBackground,
  renderIconOnBackground,
} from "./logo-utils.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const marketingDir = path.join(root, "public/marketing");
const defaultMaster = path.join(marketingDir, "garuda-prime-marketing.master.png");

const OG_W = 1200;
const OG_H = 630;
const OG_LOGO_W = 520;

const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : defaultMaster;

if (!fs.existsSync(inputPath)) {
  console.error(`Missing marketing logo: ${inputPath}`);
  process.exit(1);
}

fs.mkdirSync(marketingDir, { recursive: true });

if (inputPath !== defaultMaster) {
  fs.copyFileSync(inputPath, defaultMaster);
  console.log(`✓ saved master → ${path.relative(root, defaultMaster)}`);
}

const lightOut = path.join(marketingDir, "garuda-prime-icon.png");
const footerOut = path.join(marketingDir, "garuda-prime-icon-footer.png");

await sharp(inputPath)
  .resize(512, 512, {
    fit: "contain",
    background: MARKETING_PAGE_BG,
    kernel: sharp.kernel.lanczos3,
  })
  .png({ compressionLevel: 6, adaptiveFiltering: true })
  .toFile(lightOut);

console.log(`✓ ${path.relative(root, lightOut)} (512px, white bg)`);

const whiteStripped = await removeNearWhiteBackground(
  await sharp(inputPath).ensureAlpha().png().toBuffer(),
);
const emblemPipeline = sharp(
  await whiteStripped
    .clone()
    .trim({ threshold: 12 })
    .png()
    .toBuffer(),
).sharpen({ sigma: 0.55, m1: 0.48, m2: 0.32 });

const footerPipeline = emblemPipeline.clone();

await (await renderIconOnBackground(footerPipeline, 512, MARKETING_FOOTER_BG, { insetRatio: 0.12 }))
  .toFile(footerOut);

console.log(`✓ ${path.relative(root, footerOut)} (512px, #0f172a bg)`);

const MARKETING_FAVICONS = [
  { name: "favicon-32.png", size: 32, inset: 0.14 },
  { name: "favicon.png", size: 512, inset: 0.14 },
  { name: "apple-touch-icon.png", size: 180, inset: 0.15 },
];

for (const { name, size, inset } of MARKETING_FAVICONS) {
  const out = path.join(marketingDir, name);
  await (await renderCircularIconOnBackground(emblemPipeline, size, MARKETING_PAGE_BG, { insetRatio: inset }))
    .toFile(out);
  console.log(`✓ ${path.relative(root, out)} (${size}px, circle #fff)`);
}

const ogLogo = await emblemPipeline
  .clone()
  .resize(OG_LOGO_W, OG_LOGO_W, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    kernel: sharp.kernel.lanczos3,
  })
  .png()
  .toBuffer();

const ogMeta = await sharp(ogLogo).metadata();
const ogLogoW = ogMeta.width ?? OG_LOGO_W;
const ogLogoH = ogMeta.height ?? OG_LOGO_W;
const ogLeft = Math.max(0, Math.round((OG_W - ogLogoW) / 2));
const ogTop = Math.max(0, Math.round((OG_H - ogLogoH) / 2) - 20);

const ogBgSvg = Buffer.from(`<svg width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}" xmlns="http://www.w3.org/2000/svg">
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
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#emerald)"/>
</svg>`);

const ogBackground = await sharp(ogBgSvg).resize(OG_W, OG_H).png().toBuffer();

for (const out of [
  path.join(marketingDir, "og-share.jpg"),
  path.join(marketingDir, "og-share.png"),
]) {
  const pipeline = sharp(ogBackground).composite([{ input: ogLogo, left: ogLeft, top: ogTop }]);
  if (out.endsWith(".jpg")) {
    await pipeline.jpeg({ quality: 92, mozjpeg: true }).toFile(out);
  } else {
    await pipeline.png({ compressionLevel: 8, adaptiveFiltering: true }).toFile(out);
  }
  console.log(`✓ ${path.relative(root, out)}`);
}
