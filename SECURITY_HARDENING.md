# Garuda Prime Security Hardening (Pre-Play Store)

Security layers already applied, plus a checklist before Play Store / production release.

## Implemented

### Client PWA

| Layer | Detail |
|--------|--------|
| Session and fingerprint | Device binding, session destroy on sign-out, referral guest isolation |
| PIN | PBKDF2-SHA256 (120k iterations); hash in local storage, not plain text |
| MFA / WebAuthn | TOTP and platform passkey (client-side gate) |
| Demo auth | Disabled in production builds (`VITE_ALLOW_DEMO_AUTH` is for development only) |
| Wallet login | Server nonce, 5-minute expiry, origin binding (anti-replay) |
| Security headers | HSTS, X-Frame-Options, nosniff, Permissions-Policy |
| CORS API | Official origins only (`app.garudaprime.id`, `garudaprime.id`) |

### Backend API

| Endpoint | Hardening |
|----------|-----------|
| `auth/wallet` | Signature verification and single-use nonce |
| `auth/wallet/nonce` | Challenge issued before signing |
| `protocol/settle` | Client cannot self-credit redeem/unstake paths |
| `investment/record-deposit` | Requires valid `refId` settlement for `invest_deposit` |
| `garuda/rpc` | Authenticated caller, rate limit, and method allowlist |

### Database rules

- Users cannot escalate `role` or change their own `kycStatus` / `role`
- Client KYC self-verify is blocked (client may only set `pending`)
- Ledger, settlement, operator, and audit collections are server-only
- Direct vote/like counter manipulation is blocked
- `user_transactions`: create `pending` only; no client updates

## Checklist before Play Store

### Infrastructure

- [ ] Deploy database and storage rules from a private ops environment
- [ ] Keep service-account JSON only in server env (never in the client bundle)
- [ ] Rotate keys if they were ever committed
- [ ] Enable app attestation / bot protection for auth in production
- [ ] Enable auth rate limiting / blocking

### Production environment

- [ ] `VITE_ALLOW_DEMO_AUTH` unset or `false` in production
- [ ] `ALLOWED_CORS_ORIGINS=https://app.garudaprime.id,https://garudaprime.id`
- [ ] Private keys (`GARUDA_*_PRIVATE_KEY`, `BLOB_*`) server-side only

### Play Store

- [ ] Follow the private Play Store packaging checklist
- [ ] TWA, `assetlinks.json`, and signed AAB release
- [ ] Privacy policy and data safety form complete
- [ ] Test wallet login, invest, and KYC upload on a physical device

### Monitoring

- [ ] Alert on auth anomalies (many failed logins)
- [ ] Review audit logs periodically
- [ ] Crash reporting enabled for production builds

## Recommended next (Phase 2)

1. Enforce app attestation on database and API
2. Server-side MFA verification (not client-only)
3. Certificate pinning for TWA Android
4. External penetration test before full fintech go-live

Security contact: security@garudaprime.id
