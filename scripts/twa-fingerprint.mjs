#!/usr/bin/env node
/**
 * Print keytool commands to obtain SHA-256 for Digital Asset Links.
 */
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keystore = resolve(__dirname, "../twa/android.keystore");

console.log(`
Garuda Prime, SHA-256 fingerprint untuk assetlinks.json
Package: id.garudaprime.app

1) Buat keystore (sekali, simpan backup aman):
   keytool -genkeypair -v \\
     -keystore twa/android.keystore \\
     -alias garudaprime \\
     -keyalg RSA -keysize 2048 -validity 10000 \\
     -dname "CN=Garuda Prime, O=Garuda Prime, C=ID"

2) Ambil SHA-256:
   keytool -list -v -keystore twa/android.keystore -alias garudaprime

3) Tulis assetlinks.json:
   TWA_SHA256_FINGERPRINT="AA:BB:..." npm run twa:assetlinks

4) Deploy app (assetlinks live di):
   https://app.garudaprime.id/.well-known/assetlinks.json

5) Play App Signing: tambahkan juga fingerprint dari Play Console
   (App integrity → App signing key certificate), pisahkan koma jika dua key:
   TWA_SHA256_FINGERPRINT="upload-key...,play-signing-key..." npm run twa:assetlinks
`);

if (existsSync(keystore)) {
  console.log("Keystore ditemukan: twa/android.keystore");
  console.log("Jalankan keytool -list -v -keystore twa/android.keystore -alias garudaprime\n");
} else {
  console.log("Keystore belum ada, buat dengan perintah di langkah 1.\n");
}
