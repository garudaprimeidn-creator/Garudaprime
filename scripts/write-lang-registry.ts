#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LANG_REGISTRY,
  LANG_REGION_ORDER,
  LANG_REGION_LABELS,
  LEGACY_LANG_MAP,
  SUPPORTED_LANGS,
} from "../shared/langRegistry.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const payload = {
  registry: LANG_REGISTRY,
  regionOrder: LANG_REGION_ORDER,
  regionLabels: LANG_REGION_LABELS,
  legacyMap: LEGACY_LANG_MAP,
  supported: SUPPORTED_LANGS,
};

const outDir = path.join(root, "public/shared");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "lang-registry.json"),
  `${JSON.stringify(payload, null, 2)}\n`,
);

console.log(`✓ lang registry (${SUPPORTED_LANGS.length} countries)`);
