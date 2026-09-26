# ADR-006, Garuda Prime Native Embedded Wallet

## Status

Accepted, Foundation Phase (2026-06)

## Context

Garuda Prime currently uses **Privy** for embedded “Garuda Premium” wallets. Long-term goal: **100% sovereign wallet infrastructure** owned by Garuda Prime, no Privy, Dynamic, Web3Auth, or Magic.

Existing assets that remain:

- Firebase Auth (Google, Apple, Email, Wallet SIWE, KYCPort)
- Pay Hub API + ledger + on-chain adapter (ADR-005)
- Relayer (`payRelayerCore`) for treasury/activation
- Smart contracts on Sidra (GAT, Pay Hub, Staking, Investment, Treasury)
- External wallets (MetaMask, WalletConnect, Trust) for optional self-custody

## Decision

Build **Garuda Wallet Service**, a native server-controlled embedded wallet with:

1. **Automatic wallet generation** per verified user (no seed phrase UX)
2. **Server-side signing** via authenticated API (keys never exposed to client)
3. **Garuda Relayer** broadcast path (no MetaMask/WC popup for primary wallet)
4. **EIP-1193 shim** on client so existing send/approve/stake flows work **without UI changes**
5. **External wallets remain optional** for deposit, withdraw, self-custody

### Wallet type identifier

```
embedded:garuda  , Garuda Prime Native Embedded Wallet (PRIMARY)
embedded:privy   , Legacy Privy (deprecated, migration path)
embedded:external, External wallet linked via legacy Privy flow
metamask | trustwallet | walletconnect, External optional
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Garuda Prime App                          │
│  (UI unchanged, same wallet modals, dashboard, transactions)   │
└────────────────────────────┬────────────────────────────────────┘
                             │ Firebase ID token
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Garuda Wallet Service (API)                   │
│  POST /wallet/garuda/create  , provision wallet                 │
│  GET  /wallet/garuda/config  , public feature flags             │
│  POST /wallet/garuda/sign    , sign + broadcast tx              │
│  POST /wallet/garuda/freeze  , emergency freeze (future)        │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
             ▼                               ▼
┌────────────────────────┐    ┌──────────────────────────────────┐
│ garuda_native_wallets  │    │     Garuda Relayer Service        │
│ (Firestore, server-only)│    │  payRelayerCore + garudaWalletSigner│
│  uid, address, pubkey  │    │  SDA gas · GAT transfers · SC calls │
│  status, createdAt     │    └──────────────┬───────────────────┘
└────────────────────────┘                   │
                                               ▼
                              ┌──────────────────────────────────┐
                              │      Sidra Network (SDA + GAT)    │
                              │  Payment · Merchant · Marketplace │
                              │  Staking · Investment · Treasury  │
                              └──────────────────────────────────┘
```

### Key security rules

| Rule | Implementation |
|------|----------------|
| Private keys never sent to client | Signing only in `garudaWalletSigner.ts` |
| Master secret in env/KMS only | `GARUDA_WALLET_MASTER_SECRET` (rotate via KMS in prod) |
| Per-user derivation | SHA-256(master + uid) → secp256k1 account (upgrade to HD/KMS later) |
| Tx validation | `from` must match user's wallet; contract whitelist; amount caps |
| Audit | `garuda_wallet_sign_logs` (server-only) |
| Session | Firebase Bearer token on every sign request |

### User onboarding (automatic)

```
Register → Google/Apple/Email → KYC verified
    → ensureGarudaWallet(uid)  [GARUDA_WALLET_AUTO_ON_KYC=true]
    → connected_wallets + users.walletAddress
    → Dashboard (no manual wallet setup)
```

## Phased rollout

### Phase 1, Foundation (this ADR)

- [x] `garudaWalletCore`, create, resolve, freeze status
- [x] `garudaWalletSigner`, sign + broadcast with validation
- [x] API routes `/wallet/garuda/*`
- [x] Client `garudaWalletProvider` EIP-1193 shim
- [x] `embedded:garuda` in wallet type resolution
- [x] Feature flag `VITE_EMBEDDED_WALLET_PROVIDER=garuda`

### Phase 2, Production hardening

- [x] Sign challenge (`/wallet/garuda/challenge`) + app-lock / PIN window reuse
- [x] Device binding header (`X-Garuda-Device-Id`), strict mode via `GARUDA_WALLET_STRICT_DEVICE`
- [x] Paymaster: `ensureGarudaWalletGas` + `RELAYER_PAYMASTER_ENABLED`
- [x] Auto-provision helper `garudaWalletProvision.ts` (`GARUDA_WALLET_AUTO_ON_KYC`)
- [x] KYC hooks: admin approve + `POST /wallet/garuda/provision-kyc` + client bridge gate
- [x] KMS abstraction `garudaWalletKms.ts` (`GARUDA_WALLET_KMS_PROVIDER=env|google`)
- [x] KMS cutover orchestrator `npm run wallet:kms-cutover` (+ `--apply`)
- [ ] Google Cloud KMS live (requires gcloud + `npm run wallet:kms-cutover -- --apply`)
- [x] Governance vote on-chain hook (`POST /protocol/governance/vote`)
- [x] Governance verify + seed migrate (`npm run governance:verify`, `npm run governance:migrate`)

### Phase 3, Privy removal

- [x] Migrate `embedded:privy` → `embedded:garuda` (6 wallets, 16 bindings)
- [x] Remove `@privy-io/react-auth` dependency
- [x] Delete Privy-specific modules

### Phase 4, Full sovereignty

- [x] Server auto-approve GAT for PaymentContract (`GARUDA_PAYMENT_AUTO_APPROVE`)
- [x] PaymentContract in Garuda wallet signer allowlist
- [x] Direct PaymentContract debit without relayer (`directTransfer` + `GARUDA_PAYMENT_DIRECT_DEBIT`)
- [x] `GarudaValidatorRegistry` + `GarudaGovernanceCouncil` + deploy script
- [x] Deploy validator/governance to Sidra + merge `PAY_HUB_ONCHAIN_CONTRACTS_JSON`
- [x] Wallet Security Center, freeze, recovery request, status (Profile → Security)
- [x] Admin UI unfreeze, `/wallets` panel + `POST /api/admin/wallets/garuda`
- [x] KMS scripts, `npm run wallet:kms-setup` + `npm run wallet:kms-verify`

## Configuration

```bash
# Client
VITE_EMBEDDED_WALLET_PROVIDER=garuda
VITE_GARUDA_NATIVE_WALLET_ENABLED=true

# Server (required for signing)
GARUDA_WALLET_ENABLED=true
GARUDA_WALLET_MASTER_SECRET=<long-random-secret>
GARUDA_WALLET_AUTO_ON_KYC=true
```

## Smart contracts (existing + planned)

| Contract | Status |
|----------|--------|
| GATToken | Deployed |
| GarudaPaymentContract | Deployed |
| GarudaMerchantContract | Deployed |
| GarudaMarketplaceContract | Deployed |
| GarudaRewardContract | Deployed |
| GATStakingPool | Deployed |
| GATInvestmentVault | Deployed |
| GATProtocolTreasury | Deployed |
| ValidatorContract | Planned |
| GovernanceContract | Planned |

## Consequences

- **Positive**: Full infrastructure ownership; no vendor lock-in; consistent UX (no popups)
- **Negative**: Garuda Prime becomes custodial signer, requires strong security ops, audit, compliance
- **Migration**: Privy remains available until Phase 3; set `VITE_EMBEDDED_WALLET_PROVIDER=privy` for legacy

## References

- [ADR-004 Embedded Wallet Foundation](./004-embedded-wallet-foundation.md)
- [ADR-005 Full On-Chain Pay Hub](./005-full-onchain-pay-hub-migration.md)
- [GARUDA_PRIME_WALLET.md](../GARUDA_PRIME_WALLET.md)
