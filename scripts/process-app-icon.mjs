#!/usr/bin/env node
/**
 * Process the standalone Garuda emblem into app icon masters.
 * Feeds favicon, PWA / mobile launcher icons, and in-app header mark.
 * Usage: node scripts/process-app-icon.mjs [path-to-emblem.png]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { stripLogoMatte, TRANSPARENT } from "./logo-utils.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const assetsDir = path.join(root, "src/assets");
const defaultMaster = path.join(assetsDir, "garuda-prime-icon.master.png");

const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : defaultMaster;

if (!fs.existsSync(inputPath)) {
  console.error(`Missing emblem: ${inputPath}`);
  process.exit(1);
}

fs.mkdirSync(assetsDir, { recursive: true });

if (inputPath !== defaultMaster) {
  fs.copyFileSync(inputPath, defaultMaster);
  console.log(`✓ saved master → ${path.relative(root, defaultMaster)}`);
}

const deFringed = await stripLogoMatte(defaultMaster);

const emblemMaster = await deFringed
  .clone()
  .trim({ threshold: 10 })
  .resize(1024, 1024, {
    fit: "contain",
    background: TRANSPARENT,
    kernel: sharp.kernel.lanczos3,
  })
  .sharpen({ sigma: 0.5, m1: 0.45, m2: 0.3 })
  .png({ compressionLevel: 6, adaptiveFiltering: true })
  .toBuffer();

const iconMaster = path.join(assetsDir, "garuda-prime-icon.master.png");
const iconLightMaster = path.join(assetsDir, "garuda-prime-icon-light.master.png");
const emblemOut = path.join(assetsDir, "garuda-prime-emblem.png");

await sharp(emblemMaster).toFile(iconMaster);
await sharp(emblemMaster).toFile(iconLightMaster);
await sharp(emblemMaster).toFile(emblemOut);

const splashOut = path.join(assetsDir, "garuda-prime-splash.png");
const splash2xOut = path.join(assetsDir, "garuda-prime-splash@2x.png");
await sharp(emblemMaster)
  .clone()
  .resize(512, 512, { fit: "contain", background: TRANSPARENT, kernel: sharp.kernel.lanczos3 })
  .png({ compressionLevel: 6, adaptiveFiltering: true })
  .toFile(splashOut);
await sharp(emblemMaster)
  .clone()
  .resize(1024, 1024, { fit: "contain", background: TRANSPARENT, kernel: sharp.kernel.lanczos3 })
  .png({ compressionLevel: 6, adaptiveFiltering: true })
  .toFile(splash2xOut);

console.log(`✓ ${path.relative(root, iconMaster)} (1024px emblem)`);
console.log(`✓ ${path.relative(root, iconLightMaster)} (light master)`);
console.log(`✓ ${path.relative(root, emblemOut)} (source emblem)`);
console.log(`✓ ${path.relative(root, splashOut)} (splash 512)`);
console.log(`✓ ${path.relative(root, splash2xOut)} (splash 1024)`);
