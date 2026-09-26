# ADR-005: Migrasi Penuh, Garuda Pay Hub Full On-Chain (Sidra Network)

| Field | Value |
|-------|--------|
| **Status** | Diterima, eksekusi bertahap |
| **Tanggal** | 2026-06-04 |
| **Menggantikan** | ADR-001 sebagai **target akhir** ledger (ADR-001 tetap berlaku selama transisi) |
| **Batasan keras** | **Tanpa perubahan UI/UX/navigasi/branding** |

## Ringkasan keputusan

Garuda Prime akan bermigrasi dari **ledger finansial Firestore** (`pay_ledgers`) ke **settlement on-chain penuh** di **Sidra Network (SDA)** dengan:

- **Embedded Wallet** (Garuda Prime Wallet) sebagai dompet utama operasional
- **External Wallet** (WalletConnect, MetaMask, dll.) hanya untuk deposit, withdraw, self-custody
- **Relayer Service** menandatangani & membayar gas SDA
- **Smart Contract** sebagai sumber kebenaran saldo & riwayat transaksi
- **Firestore** tetap untuk profil, KYC, notifikasi, cache, AI, analytics, **bukan** ledger utama

Pengguna **tidak** melihat perubahan layout, warna, menu, atau alur layar. Perubahan hanya di backend, kontrak, dan sumber data API.

## Arsitektur target

```
Garuda Prime App (UI tidak berubah)
        ↓
Firebase Auth (Google / Apple / Email / HP / KYC Port)
        ↓
Embedded Wallet (Privy / vendor) → alamat Sidra per uid
        ↓
Pay Hub API (Vercel), orkestrasi, fee, idempotency
        ↓
Relayer Service (pay_relayer_jobs, gas policy)
        ↓
Garuda Pay Hub Smart Contracts (Sidra)
        ↓
GATToken + vaults (treasury, merchant, invest, stake, reward, gas)
        ↓
Sidra RPC / Explorer (tx hash, block, status)
```

## Pemetaan kontrak

| Spesifikasi migrasi | Status codebase | Catatan |
|---------------------|-----------------|--------|
| GATToken.sol | ✅ `contracts/src/GATToken.sol` | Sudah deploy Sidra |
| TreasuryContract.sol | ✅ `GATProtocolTreasury.sol` | Fee bucket protokol |
| StakingContract.sol | ✅ `GATStakingPool.sol` | Redeploy recovery |
| InvestmentContract.sol | ✅ `GATInvestmentVault.sol` | Redeploy recovery |
| PaymentContract.sol | 🆕 `GarudaPaymentContract.sol` | P2P / transfer relay |
| MerchantContract.sol | 🆕 `GarudaMerchantContract.sol` | QR merchant settle |
| MarketplaceContract.sol | 🆕 `GarudaMarketplaceContract.sol` | Checkout escrow |
| RewardContract.sol | 🆕 `GarudaRewardContract.sol` | Referral / validator reward |
| ValidatorContract.sol | ✅ `GarudaValidatorRegistry.sol` | Deployed Sidra `0xA884…9815` |
| GovernanceContract.sol | ✅ `GarudaGovernanceCouncil.sol` | Deployed Sidra `0xA5f9…91CE` |
| PayHubLedgerAnchor.sol | ✅ Audit hash (transisi) | Diganti event on-chain penuh |

## Mode operasi (feature flag)

| `PAY_HUB_LEDGER_MODE` | Perilaku |
|----------------------|----------|
| `hybrid` (default prod) | Ledger Firestore seperti ADR-001 |
| `shadow` | Tulis Firestore + relay on-chain (reconcile) |
| `onchain` | Hanya chain; Firestore cache read-only |

Env: `PAY_HUB_LEDGER_MODE`, `VITE_PAY_HUB_ONCHAIN_CONTRACTS_JSON` (alamat deploy).

## Firestore setelah migrasi

| Koleksi | Peran baru |
|---------|------------|
| `users`, `kyc_*`, `notifications`, … | Tetap sumber utama |
| `pay_ledgers` | **Deprecated** → cache / mirror dari chain |
| `pay_transfers`, `pay_receipts`, `pay_deposits` | Index + `txHash` wajib, bukan saldo utama |
| `pay_relayer_jobs` | Antrian relayer (diperluas) |
| `connected_wallets` | Mapping uid ↔ embedded address |

## Dual wallet (tanpa ubah UI)

| Dompet | Peran on-chain |
|--------|----------------|
| **Garuda Prime Wallet** (embedded) | Semua fitur in-app: transfer, market, merchant, invest GAT, stake GAT, reward |
| **External** | Deposit GAT ke embedded, withdraw ke external, integrasi Web3 |

UI tetap menampilkan panel Dompet + Pay Hub; API mengembalikan saldo dari **chain balance** alamat embedded, bukan `pay_ledgers.gatBalance`.

## Relayer, job types (target)

| Job | Kontrak |
|-----|---------|
| `withdraw_gat` | ✅ Existing |
| `transfer_gat` | GarudaPaymentContract (`relayTransfer` or `directTransfer`) |
| `merchant_settle` | GarudaMerchantContract |
| `market_checkout` | GarudaMarketplaceContract |
| `reward_credit` | GarudaRewardContract |
| `governance_vote` | GarudaGovernanceCouncil |
| `governance_proposal` | GarudaGovernanceCouncil |
| `governance_close` | GarudaGovernanceCouncil |
| `validator_activate` | GarudaValidatorRegistry |
| `approve_gat` | One-time approval embedded wallet |

Gas: dibayar relayer dari **Gas Vault** (SDA native + policy `RELAYER_MAX_GAT_PER_TX`).

## Fase eksekusi

Lihat [MIGRATION-ONCHAIN-EXECUTION-PLAN.md](../MIGRATION-ONCHAIN-EXECUTION-PLAN.md).

1. **Fase 0**, ADR, kontrak, deploy testnet, env, tidak ubah prod default  
2. **Fase 1**, Shadow: setiap settle tulis chain + Firestore, dashboard reconcile  
3. **Fase 2**, Saldo API dari `chainBalanceService` (UI field sama)  
4. **Fase 3**, Cutover per fitur: P2P → merchant → market → invest → stake → reward  
5. **Fase 4**, Stop write `pay_ledgers`; migrasi saldo tersisa (operasi manual + script)  
6. **Fase 5**, Explorer & admin monitoring on-chain (data source RPC, desain panel sama)

## Kriteria selesai

- [ ] 100% transaksi finansial memiliki `txHash` + status on-chain  
- [ ] Tidak ada debit/kredit saldo tanpa event kontrak  
- [ ] Regression UI: screenshot parity wallet/market/invest  
- [ ] Embedded wallet auto-provision setiap registrasi  
- [ ] External wallet hanya deposit/withdraw path  
- [ ] Runbook ops + monitoring relayer & gas vault  

## Risiko

| Risiko | Mitigasi |
|--------|----------|
| Gas cost spike | Gas vault + limit harian per uid |
| Relayer key compromise | Multi-sig owner, rotate key, HSM fase enterprise |
| Migrasi saldo off-chain | Snapshot + jadwal cutover + audit anchor |
| UX popup MetaMask | Embedded + relayer-only paths untuk fitur utama |

## Referensi kode fondasi

- `contracts/src/payhub/*.sol`
- `server/payHubLedgerMode.ts`
- `server/onChainPayHubAdapter.ts`
- `server/chainBalanceService.ts`
- `contracts/scripts/deploy-payhub-onchain.cjs`
