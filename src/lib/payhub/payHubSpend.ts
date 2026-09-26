import { PayHubApiError } from "./payHubApi";
import { runPayHubApprovalFlow } from "./runPayHubApprovalFlow";
import type { WalletProvider } from "../web3/walletService";

export function isPayHubApprovalError(err: unknown): boolean {
  if (err instanceof PayHubApiError && err.code === "payhub/approval-required") {
    return true;
  }
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  return msg.includes("approval required") || msg.includes("approve pay hub");
}

/** Run Pay Hub debit; on missing GAT allowance, prompt wallet approve then retry once. */
export async function withPayHubApprovalRetry<T>(
  walletAddress: string,
  provider: WalletProvider | undefined,
  operation: () => Promise<T>,
  onApproving?: () => void,
): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    if (!isPayHubApprovalError(err)) throw err;
    onApproving?.();
    const approval = await runPayHubApprovalFlow(walletAddress, provider, { force: true });
    if (!approval.ok) throw err;
    return await operation();
  }
}
