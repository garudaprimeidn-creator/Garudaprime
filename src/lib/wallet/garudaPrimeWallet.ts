import type { PayLedgerSnapshot } from "../payhub/payLedgerService";
import { isGarudaNativeWalletType } from "../web3/walletService";

/** Relayer gas airdrop ceiling, not shown as user portfolio balance on native Garuda wallets. */
const GARUDA_ACTIVATION_SDA_CEILING = 0.21;

/** Garuda Prime Wallet, saldo GAT on-chain di dompet terhubung. */
export function resolveGarudaPrimeGatDisplay(holdings: Record<string, number>): number {
  return holdings.GAT ?? 0;
}

type LedgerInput = Pick<PayLedgerSnapshot, "gatBalance" | "onChainGat" | "onChainWallet"> | number | null | undefined;

const ledgerMatchesWallet = (
  ledger: PayLedgerSnapshot,
  walletAddress?: string,
): boolean => {
  const ledgerWallet = ledger.onChainWallet?.trim().toLowerCase();
  const active = walletAddress?.trim().toLowerCase();
  if (!ledgerWallet || !active) return true;
  return ledgerWallet === active;
};

/** On-chain GAT from stabilized wallet holdings, source of truth for asset display. */
export function resolveActiveWalletOnChainGat(
  holdings: Record<string, number>,
  ledger?: LedgerInput,
  walletAddress?: string,
): number {
  const chain = holdings.GAT ?? 0;
  if (!ledger || typeof ledger === "number") return chain;
  if (!ledgerMatchesWallet(ledger, walletAddress)) return chain;
  const apiOnChain = ledger.onChainGat ?? 0;
  if (chain <= 0 && apiOnChain > 0) return apiOnChain;
  return chain;
}

/** GAT spendable for on-chain pay/send/swap, on-chain is source of truth when Firestore ledger is deprecated. */
export function resolveGarudaPrimeSpendableGat(
  holdings: Record<string, number>,
  ledger?: LedgerInput,
  walletAddress?: string,
): number {
  const chain = resolveActiveWalletOnChainGat(holdings, ledger, walletAddress);
  if (!ledger || typeof ledger === "number") return chain;
  if (!ledgerMatchesWallet(ledger, walletAddress)) return chain;
  if (ledger.fsLedgerDeprecated) return chain;

  const ledgerOnly = ledger.ledgerGat ?? ledger.fsLedgerGat ?? 0;
  const merchantPool = ledger.merchantPoolGat ?? 0;
  return Math.max(chain, ledgerOnly + merchantPool);
}

export function isGarudaPrimeNativeWalletProvider(provider?: string | null): boolean {
  return provider === "embedded:garuda" || isGarudaNativeWalletType(provider);
}

/**
 * Portfolio display for Garuda Prime native wallets, hide relayer activation SDA
 * so new users see an empty wallet. External wallets keep on-chain balances.
 */
export function mergeHoldingsForGarudaPrimeWallet(
  holdings: Record<string, number>,
  walletProvider?: string | null,
): Record<string, number> {
  if (!isGarudaPrimeNativeWalletProvider(walletProvider)) {
    return holdings;
  }

  const sda = holdings.SDA ?? 0;
  const gat = holdings.GAT ?? 0;
  if (sda > 0 && sda <= GARUDA_ACTIVATION_SDA_CEILING && gat <= 0) {
    return { ...holdings, SDA: 0 };
  }

  return holdings;
}

export const hasEnoughGarudaPrimeGat = (
  holdings: Record<string, number>,
  need: number,
  ledger?: LedgerInput,
  walletAddress?: string,
): boolean => resolveGarudaPrimeSpendableGat(holdings, ledger, walletAddress) >= need;
