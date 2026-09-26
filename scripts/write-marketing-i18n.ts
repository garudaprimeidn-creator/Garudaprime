#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMarketingCopyBundle } from "../shared/marketingI18n.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outPath = path.join(root, "public/marketing/copy-bundle.js");
const apkMetaPath = path.join(root, "public/apk-meta.json");
const bundle = buildMarketingCopyBundle();

if (fs.existsSync(apkMetaPath)) {
  const apkMeta = JSON.parse(fs.readFileSync(apkMetaPath, "utf8")) as {
    copyKey?: string;
  };
  if (apkMeta.copyKey) {
    for (const locale of Object.keys(bundle)) {
      bundle[locale].getAppApkMeta = apkMeta.copyKey;
    }
  }
}

fs.writeFileSync(
  outPath,
  `/* Auto-generated, do not edit. Run: npx tsx scripts/write-marketing-i18n.ts */\nwindow.MARKETING_COPY_BUNDLE=${JSON.stringify(bundle)};\n`,
);

console.log(`✓ marketing copy (${Object.keys(bundle).length} locales)`);
