#!/usr/bin/env node
/**
 * Build Garuda Prime Android APK (TWA) and copy to public/downloads/.
 *
 * Usage:
 *   npm run apk:build
 *   TWA_KEYSTORE_PASSWORD=secret TWA_KEY_PASSWORD=secret npm run apk:build
 */
import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { TwaManifest, TwaGenerator, ConsoleLog } = require("@bubblewrap/core");

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const androidDir = resolve(root, "android");
const keystorePath = resolve(root, "twa/android.keystore");
const downloadsDir = resolve(root, "public/downloads");
const apkPublicName = "garuda-prime.apk";

function readTwaVersion() {
  const manifest = JSON.parse(readFileSync(resolve(root, "twa/twa-manifest.json"), "utf8"));
  return {
    name: manifest.appVersionName ?? manifest.appVersion ?? "1.0.0",
    code: manifest.appVersionCode ?? 1,
  };
}

function formatApkSize(bytes) {
  if (bytes >= 1_048_576) return `~${(bytes / 1_048_576).toFixed(1)} MB`;
  return `~${Math.round(bytes / 1024)} KB`;
}

const KEY_ALIAS = "garudaprime";
const DEFAULT_STORE_PASS = process.env.TWA_KEYSTORE_PASSWORD ?? "GarudaPrime2026!";
const DEFAULT_KEY_PASS = process.env.TWA_KEY_PASSWORD ?? DEFAULT_STORE_PASS;

const log = new ConsoleLog("apk:build");

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: "inherit", cwd: opts.cwd ?? root, env: { ...process.env, ...opts.env } });
}

function ensureKeystore() {
  if (existsSync(keystorePath)) {
    console.log(`✓ keystore ${keystorePath}`);
    return;
  }
  mkdirSync(dirname(keystorePath), { recursive: true });
  console.log("→ Creating signing keystore…");
  run(
    `keytool -genkeypair -v -keystore "${keystorePath}" -alias ${KEY_ALIAS} `
    + `-keyalg RSA -keysize 2048 -validity 10000 `
    + `-storepass "${DEFAULT_STORE_PASS}" -keypass "${DEFAULT_KEY_PASS}" `
    + `-dname "CN=Garuda Prime, O=Garuda Prime, C=ID"`,
  );
}

function readSha256Fingerprint() {
  const out = execSync(
    `keytool -list -v -keystore "${keystorePath}" -alias ${KEY_ALIAS} -storepass "${DEFAULT_STORE_PASS}"`,
    { encoding: "utf8" },
  );
  const m = out.match(/SHA256:\s*([0-9A-F:]+)/i);
  if (!m) throw new Error("Could not read SHA-256 fingerprint from keystore");
  return m[1].trim().toUpperCase();
}

function writeAssetLinks(fingerprint) {
  run(`TWA_SHA256_FINGERPRINT="${fingerprint}" node scripts/write-assetlinks.mjs`);
}

function patchReleaseSigning() {
  const gradleProps = resolve(androidDir, "gradle.properties");
  const lines = existsSync(gradleProps) ? readFileSync(gradleProps, "utf8").split("\n") : [];
  const set = (key, val) => {
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
    const row = `${key}=${val}`;
    if (idx >= 0) lines[idx] = row;
    else lines.push(row);
  };
  set("RELEASE_STORE_FILE", "../../twa/android.keystore");
  set("RELEASE_STORE_PASSWORD", DEFAULT_STORE_PASS);
  set("RELEASE_KEY_ALIAS", KEY_ALIAS);
  set("RELEASE_KEY_PASSWORD", DEFAULT_KEY_PASS);
  writeFileSync(gradleProps, `${lines.filter(Boolean).join("\n")}\n`);

  const appGradle = resolve(androidDir, "app/build.gradle");
  let gradle = readFileSync(appGradle, "utf8");
  if (!gradle.includes("signingConfigs")) {
    gradle = gradle.replace(
      "    buildTypes {\n        release {\n            minifyEnabled true",
      `    signingConfigs {
        release {
            storeFile file(RELEASE_STORE_FILE)
            storePassword RELEASE_STORE_PASSWORD
            keyAlias RELEASE_KEY_ALIAS
            keyPassword RELEASE_KEY_PASSWORD
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true`,
    );
    writeFileSync(appGradle, gradle);
  }
}

async function generateAndroidProject() {
  const manifestPath = resolve(root, "twa/twa-manifest.json");
  const twaManifest = await TwaManifest.fromFile(manifestPath);
  twaManifest.signingKey = {
    path: keystorePath,
    alias: KEY_ALIAS,
  };

  if (existsSync(androidDir)) {
    console.log("→ Removing previous android/ project…");
    rmSync(androidDir, { recursive: true, force: true });
  }

  console.log("→ Generating TWA Android project…");
  const generator = new TwaGenerator(root);
  await generator.createTwaProject(androidDir, twaManifest, log);
  await twaManifest.saveToFile(resolve(androidDir, "twa-manifest.json"));
}

function buildApk() {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (!sdk) {
    throw new Error("Set ANDROID_HOME to your Android SDK path");
  }
  console.log("→ Running Gradle assembleRelease…");
  run("./gradlew assembleRelease --no-daemon", {
    cwd: androidDir,
    env: {
      ANDROID_HOME: sdk,
      ANDROID_SDK_ROOT: sdk,
      JAVA_HOME: process.env.JAVA_HOME,
    },
  });
}

function copyApkOut() {
  const { name: versionName } = readTwaVersion();
  const apkVersionedName = `garuda-prime-v${versionName}.apk`;
  const releaseApk = resolve(androidDir, "app/build/outputs/apk/release/app-release.apk");
  const unsignedApk = resolve(androidDir, "app/build/outputs/apk/release/app-release-unsigned.apk");
  const source = existsSync(releaseApk) ? releaseApk : unsignedApk;
  if (!existsSync(source)) {
    throw new Error(`APK not found at ${releaseApk}`);
  }
  mkdirSync(downloadsDir, { recursive: true });
  copyFileSync(source, resolve(downloadsDir, apkPublicName));
  copyFileSync(source, resolve(downloadsDir, apkVersionedName));
  const sizeLabel = formatApkSize(readFileSync(source).length);
  console.log(`✓ APK → public/downloads/${apkPublicName} (${sizeLabel})`);
  console.log(`  Version: v${versionName} · also saved as ${apkVersionedName}`);
  run("node scripts/write-apk-meta.mjs");
}

async function main() {
  console.log("\n=== Garuda Prime, Build Android APK ===\n");
  ensureKeystore();
  const fingerprint = readSha256Fingerprint();
  writeAssetLinks(fingerprint);
  await generateAndroidProject();
  patchReleaseSigning();
  buildApk();
  copyApkOut();
  console.log("\nDone. Deploy with: npm run deploy");
  console.log("Download URL: https://garudaprime.id/downloads/garuda-prime.apk\n");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
