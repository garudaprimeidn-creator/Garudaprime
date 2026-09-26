import { requestWalletActivation, type WalletActivationResponse } from "./walletActivationService";
import { runPayHubApprovalFlow, type PayHubApprovalFlowResult } from "./runPayHubApprovalFlow";
import type { WalletProvider } from "../web3/walletService";

const RECEIPT_WAIT_MS = 2_500;

export type ActivatePayHubWalletResult = {
  activation: WalletActivationResponse | null;
  approval: PayHubApprovalFlowResult;
  /** Pay Hub on-chain siap (allowance cukup). */
  payHubReady: boolean;
};

/**
 * Aktivasi Pay Hub setelah dompet terhubung:
 * 1) Airdrop SDA dari relayer (jika perlu), gas untuk approve
 * 2) Approve GAT ke Payment SC (tanda tangan user / Privy; gas dari SDA dompet)
 */
export async function activatePayHubWallet(
  address: string,
  provider?: WalletProvider,
  options?: { force?: boolean; skipActivation?: boolean },
): Promise<ActivatePayHubWalletResult> {
  let activation: WalletActivationResponse | null = null;

  if (!options?.skipActivation) {
    try {
      activation = await requestWalletActivation(address);
      if (activation?.granted && activation.txHash) {
        await new Promise((r) => setTimeout(r, RECEIPT_WAIT_MS));
      }
    } catch {
      activation = null;
    }
  }

  const approval = await runPayHubApprovalFlow(address, provider, options);
  const payHubReady = approval.ok && (approval.approved || Boolean(approval.alreadyApproved));

  return { activation, approval, payHubReady };
}
