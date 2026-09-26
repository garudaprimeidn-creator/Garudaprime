#!/usr/bin/env node
/**
 * Process premium Garuda Prime brand lockup for auth + splash (transparent matte).
 * Usage: node scripts/process-brand-auth.mjs [path-to-master.png]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { stripLogoMatte, TRANSPARENT } from "./logo-utils.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const assetsDir = path.join(root, "src/assets");
const publicDir = path.join(root, "public");
const defaultMaster = path.join(assetsDir, "garuda-prime-brand.master.png");

const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : defaultMaster;

if (!fs.existsSync(inputPath)) {
  console.error(`Missing brand master: ${inputPath}`);
  process.exit(1);
}

if (inputPath !== defaultMaster) {
  fs.copyFileSync(inputPath, defaultMaster);
  console.log(`✓ saved master → ${path.relative(root, defaultMaster)}`);
}

const matte = await stripLogoMatte(defaultMaster, { blackCutoff: 24, darkMatteLuma: 40 });

const outputs = [
  [path.join(assetsDir, "garuda-prime-brand-dark.png"), 1024],
  [path.join(assetsDir, "garuda-prime-brand-dark@2x.png"), 1536],
  [path.join(assetsDir, "garuda-prime-splash.png"), 512],
  [path.join(assetsDir, "garuda-prime-splash@2x.png"), 1024],
  [path.join(publicDir, "splash-logo.png"), 512],
  [path.join(publicDir, "splash-logo@2x.png"), 1024],
];

for (const [out, size] of outputs) {
  await matte
    .clone()
    .resize(size, size, {
      fit: "contain",
      background: TRANSPARENT,
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 6, adaptiveFiltering: true })
    .toFile(out);
  console.log(`✓ ${path.relative(root, out)} (${size}px)`);
}
