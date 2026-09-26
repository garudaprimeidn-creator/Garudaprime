# Dompet & Jaringan Sidra, Panduan Pengguna

## Login vs dompet terhubung

- **Login** (Google/email) = akun Garuda Prime
- **Hubungkan dompet** = alamat Sidra untuk GAT, Pay Hub on-chain, kirim/terima

Tanpa langkah kedua, app menampilkan "Hubungkan dompet" di Dompet / Pay Hub.

**Disarankan:** **Garuda Wallet (Privy)**, embedded di Sidra, tanpa seed phrase manual.

## Gas: SDA (Sidra), bukan ETH

| Yang benar | Yang salah |
|------------|------------|
| Jaringan **SDA Sidra Network** (chain 97453) | **Ethereum Mainnet** |
| Gas kecil dalam **SDA** | Biaya ~$0.11 **ETH** |

Jika dompet menampilkan ETH, pindah network ke Sidra lalu ulangi approve/transaksi.

## Approve GAT (sekali)

Pay Hub on-chain membutuhkan **approve** GAT ke kontrak Payment. Setelah deploy terbaru, app memaksa switch ke Sidra sebelum approve.

## Aktivasi dompet (Garuda menyiapkan gas)

Saat hubungkan **Garuda Wallet (Privy)** atau dompet utama:

1. Server boleh mengirim **~0,05 SDA** dari relayer ke dompet Anda (sekali per dompet), `POST /api/wallet/activate`
2. Lalu app menjalankan **approve GAT** (tanda tangan dompet; gas memakai SDA yang disiapkan)

Anda **tidak perlu beli SDA** manual untuk langkah pertama. Privy gasless penuh (tanpa popup approve) = fase berikutnya.

## Pemulihan sesi dompet

App memulihkan dompet utama dari:

1. Sesi browser tersimpan
2. Profil `walletAddress`
3. Daftar `connected_wallets` di Firestore

## Ops

```bash
npm run payhub:onchain-monitor
npm run payhub:verify-production
```
