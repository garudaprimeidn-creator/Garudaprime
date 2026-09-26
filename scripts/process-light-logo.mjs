#!/usr/bin/env node
/**
 * Process the official Garuda Prime master into transparent light-mode assets.
 * Usage: node scripts/process-light-logo.mjs [path-to-master.png]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  removeNearBlackBackground,
  removeNearWhiteBackground,
  TRANSPARENT,
} from "./logo-utils.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const assetsDir = path.join(root, "src/assets");
const defaultMaster = path.join(assetsDir, "garuda-prime-logo-light.master.png");

const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : defaultMaster;

if (!fs.existsSync(inputPath)) {
  console.error(`Missing master: ${inputPath}`);
  process.exit(1);
}

fs.mkdirSync(assetsDir, { recursive: true });

if (inputPath !== defaultMaster) {
  fs.copyFileSync(inputPath, defaultMaster);
  console.log(`✓ saved master → ${path.relative(root, defaultMaster)}`);
}

/** Strip black/white matte, normalize to 1024² */
const rawMaster = await sharp(defaultMaster).ensureAlpha().png().toBuffer();
const transparentRaw = await removeNearWhiteBackground(
  await (await removeNearBlackBackground(rawMaster)).png().toBuffer(),
);

const squareMaster = await transparentRaw
  .clone()
  .resize(1024, 1024, {
    fit: "contain",
    background: TRANSPARENT,
    kernel: sharp.kernel.lanczos3,
  })
  .png()
  .toBuffer();

const transparentMaster = sharp(squareMaster);
const w = 1024;
const h = 1024;

const fullTrimmed = await transparentMaster
  .clone()
  .trim({ threshold: 8 })
  .png({ compressionLevel: 6, adaptiveFiltering: true })
  .toBuffer();

/** Full brand lockup, onboarding, login, splash (transparent, both themes) */
const fullOut = path.join(assetsDir, "garuda-prime-logo-light.png");
const fullDarkOut = path.join(assetsDir, "garuda-prime-logo.png");
await sharp(fullTrimmed).clone().toFile(fullOut);
await sharp(fullTrimmed).clone().toFile(fullDarkOut);
console.log(`✓ ${path.relative(root, fullOut)} (transparent lockup)`);
console.log(`✓ ${path.relative(root, fullDarkOut)} (dark theme lockup)`);
