# Garuda Prime

Garuda Prime is an Islamic fintech platform for payments, a digital Halal marketplace, and on-chain utilities on Sidra Chain.

- **Application:** [https://app.garudaprime.id](https://app.garudaprime.id)
- **Repository:** [https://github.com/garudaprimeidn-creator/Garudaprime](https://github.com/garudaprimeidn-creator/Garudaprime)

## Features

- Wallet-connected payments and peer-to-peer transfers
- Digital Halal Market with email delivery (no physical shipping)
- Identity verification and regulated account onboarding
- GAT token utilities, staking, and SidraSwap liquidity support

## Requirements

- Node.js 20 or later
- npm 10 or later

Copy `.env.example` to `.env.local` and provide the configuration values for your environment. Do not commit secrets or private keys.

## Getting started

```bash
npm install
npm run dev
```

This starts the main client with Vite. For a local API process, run `npm run payhub:local-api` in a separate terminal.

## Repository layout

| Path | Description |
|------|-------------|
| `src/` | Main client application |
| `server/` | Shared API handlers |
| `functions/` | Serverless Pay Hub workers |
| `contracts/` | Solidity contracts and Hardhat scripts |

## Security

Please report security issues privately to `support@garudaprime.id`. Do not open public issues for unpatched vulnerabilities. Hardening notes for this codebase are documented in `SECURITY_HARDENING.md`.

## Attributions

Third-party notices are listed in `ATTRIBUTIONS.md`.
