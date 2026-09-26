# Garuda Prime Wallet, arsitektur target

## Dua lapisan dompet

| Lapisan | Peran |
|--------|--------|
| **Garuda Prime Wallet** | Dompet utama (Garuda Premium / embedded). Transfer, QR merchant, marketplace, invest, staking, rewards, komunitas, tanpa keluar aplikasi. |
| **External wallet** | MetaMask, WalletConnect, Trust, Rabby, Coinbase, hanya deposit, withdraw, self-custody, integrasi Web3 eksternal. |

## Alur target (relayer)

```
Pengguna → Garuda Prime → Relayer → Smart Contract → Sidra → TX Hash
```

Kontrak: GATToken, PaymentContract, MerchantContract, MarketplaceContract, InvestmentContract, StakingContract, RewardContract, TreasuryContract, ValidatorContract, GovernanceContract.

Gas: SDA (vault treasury, merchant, investment, validator, dll.). Utility: GAT.

## Status implementasi (app)

- [x] Panel UI **Garuda Pay Hub** dihapus; saldo GAT ditampilkan di kartu **Garuda Prime Wallet**.
- [x] Cek saldo merchant/marketplace/invest memakai helper `garudaPrimeWallet.ts`.
- [x] **ADR-006**, Garuda Native Embedded Wallet foundation (`garudaWalletCore`, API `/wallet/garuda/*`, EIP-1193 shim).
- [ ] Relayer enterprise (tanpa popup approve berulang), server + kontrak.
- [ ] Debit langsung dari dompet tanpa ledger Pay Hub terpisah.
- [ ] Explorer & Admin monitoring on-chain penuh.
- [ ] Phase 3: hapus Privy (`@privy-io/react-auth`).

Ledger Pay Hub on-chain di backend tetap aktif sampai relayer + PaymentContract menggantikan debit ledger.
