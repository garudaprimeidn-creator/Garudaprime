/**
 * Transaksi GAT cepat via Pay Hub + relayer Sidra, tanpa popup MetaMask/WC.
 * Dompet Garuda: server signer / direct debit.
 * Dompet Web3: relay PaymentContract (perlu approve sekali di background).
 */
import { isGatContractConfigured } from "../web3/gatToken";
import { withWalletTimeout } from "../web3/walletTimeout";
import {
  isPayHubApiConfigured,
  transferPayHubGat,
  type PayHubTransferResult,
} from "./payHubApi";
import { settlePayment, type PaySettlementInput, type PaySettlementResult } from "./payHubService";
import { fetchPayHubApprovalStatus } from "./payHubApproval";
import { activatePayHubWallet } from "./activatePayHubWallet";
import type { WalletProvider } from "../web3/walletService";
import { isGarudaNativeWalletType } from "../web3/walletService";

export function isInstantSidraGatEnabled(): boolean {
  return isPayHubApiConfigured() && isGatContractConfigured();
}

/** Siapkan Pay Hub di background, approve sekali, transaksi berikutnya instan. */
export async function warmInstantSidraWallet(
  address: string,
  provider?: WalletProvider,
): Promise<void> {
  if (!isInstantSidraGatEnabled() || !address?.startsWith("0x")) return;

  const status = await fetchPayHubApprovalStatus().catch(() => null);
  if (status?.sufficient) return;

  if (isGarudaNativeWalletType(provider)) {
    void activatePayHubWallet(address, provider, { skipActivation: false }).catch(() => null);
    return;
  }

  void activatePayHubWallet(address, provider).catch(() => null);
}

export async function instantTransferGat(
  recipientAddress: string,
  amount: number,
): Promise<PayHubTransferResult> {
  return withWalletTimeout(
    transferPayHubGat(recipientAddress, amount),
    28_000,
    "Transfer Sidra timeout, cek riwayat dompet lalu coba lagi",
    "payhub/timeout",
  );
}

export async function instantPayMerchant(
  input: PaySettlementInput,
): Promise<PaySettlementResult> {
  return withWalletTimeout(
    settlePayment(input),
    28_000,
    "Pembayaran timeout, cek riwayat dompet lalu coba lagi",
    "payhub/timeout",
  );
}
