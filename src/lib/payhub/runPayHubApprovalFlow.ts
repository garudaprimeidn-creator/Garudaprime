import { ensurePayHubGatApproval } from "./payHubApproval";
import { ensureSidraNetwork } from "../web3/ensureSidraNetwork";
import { getAvailableWalletProvider } from "../web3/walletProviderResolution";
import { isGarudaPremiumWalletType, type WalletProvider } from "../web3/walletService";

export type PayHubApprovalFlowResult =
  | { ok: true; approved: boolean; txHash?: string; alreadyApproved?: boolean }
  | { ok: false; code: "no-wallet" | "wrong-network" | "user-rejected" | "failed"; message: string };

export async function runPayHubApprovalFlow(
  address: string,
  provider?: WalletProvider,
  options?: { force?: boolean },
): Promise<PayHubApprovalFlowResult> {
  if (!address?.startsWith("0x")) {
    return { ok: false, code: "no-wallet", message: "Wallet not linked" };
  }

  const signer = isGarudaPremiumWalletType(provider)
    ? undefined
    : getAvailableWalletProvider(
      provider === "metamask" || provider === "trustwallet" ? provider : undefined,
    );
  if (signer) {
    try {
      await ensureSidraNetwork(signer);
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      if (msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel")) {
        return { ok: false, code: "user-rejected", message: "Network switch cancelled" };
      }
      return { ok: false, code: "wrong-network", message: "Switch wallet to Sidra Network (SDA)" };
    }
  }

  const result = await ensurePayHubGatApproval(address, provider, options);
  if (result.approved) {
    return { ok: true, approved: true, txHash: result.txHash, alreadyApproved: !result.txHash };
  }

  return {
    ok: false,
    code: "failed",
    message: "GAT approval failed, use Garuda Wallet on Sidra or add SDA for gas",
  };
}
