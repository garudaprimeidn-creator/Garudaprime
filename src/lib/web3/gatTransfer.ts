export type { TransferProgress, TransferOptions, TransferResult } from "./walletTransfer";
export { resolveWalletSendAsset, transferWalletAsset } from "./walletTransfer";
import { resolveWalletSendAsset, transferWalletAsset, type TransferOptions } from "./walletTransfer";
import type { WalletProvider } from "./walletService";

/** Send GAT on Sidra via connected wallet. Simulates when contract is not deployed. */
export const transferGat = async (
  from: string,
  to: string,
  amount: string,
  provider?: WalletProvider,
  options?: TransferOptions,
) => {
  const asset = resolveWalletSendAsset("GAT");
  if (!asset) return { txHash: null, simulated: true as const };
  return transferWalletAsset(from, to, amount, asset, provider, options);
};
