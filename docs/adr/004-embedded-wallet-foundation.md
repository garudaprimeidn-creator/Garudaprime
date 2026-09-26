# ADR-004: Embedded Wallet & Gasless UX (Fase 4)

**Status:** Fondasi aktif (vendor SDK TBD)  
**Tanggal:** 2026-05-31  
**Prasyarat:** Fase 0-3 Pay Hub stabil

## Tujuan

Retail user mendapat alamat wallet tanpa seed phrase manual; power user tetap pakai WalletConnect. Relayer Garuda menandatangani meta-transaksi terbatas (deposit/stake) dengan policy gas.

## Keputusan sementara

| Aspek | Arah |
|-------|------|
| Retail | Embedded wallet (MPC atau AA), vendor TBD |
| Power user | WalletConnect (existing) |
| Pay Hub | Tetap Firestore ledger; chain untuk backing & produk |
| Gas | Relayer / paymaster membayar SDA; batas per user/hari |

## Env rencana

```bash
EMBEDDED_WALLET_PROVIDER=           # e.g. privy | dynamic | web3auth
EMBEDDED_WALLET_APP_ID=
RELAYER_PAYMASTER_ENABLED=false
```

## Tidak termasuk v1 Fase 4

- Mengganti ledger Firestore dengan on-chain per tap
- Full account abstraction tanpa audit relayer

## Langkah berikutnya (saat kickoff)

1. Pilih vendor + pricing + KYC binding
2. ADR implementasi terpisah per vendor
3. Integrasi `src/lib/web3/` + auth binding `uid ↔ address`
4. Relayer paymaster policy di `payRelayerCore`

Lihat [ADR-001 Fase 4 checklist](./001-hybrid-pay-hub-architecture.md#fase-4--embedded-wallet--gasless-ux).
