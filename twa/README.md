# TWA / Android wrapper

Package: `id.garudaprime.app`  
Host: `https://app.garudaprime.id`

## Quick start

```bash
npm install -g @bubblewrap/cli
npm run twa:fingerprint          # buat keystore + SHA-256
TWA_SHA256_FINGERPRINT="..." npm run twa:assetlinks
npm run twa:init                 # generates android/
```

Full Play Store packaging steps are kept in the private working tree.

## Files

| File | Purpose |
|------|---------|
| `twa-manifest.json` | Bubblewrap config |
| `../public/.well-known/assetlinks.json` | Digital Asset Links (deployed with app) |
| `android.keystore` | Signing key (**gitignore, backup offline**) |
