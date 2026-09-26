import { getPublicClient } from "./publicClient";

export type TxConfirmationResult = {
  confirmed: boolean;
  reverted?: boolean;
};

/** Poll Sidra RPC until tx is mined (success or revert). */
export async function waitForOnChainTxConfirmation(
  txHash: string,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<TxConfirmationResult> {
  const hash = txHash.trim();
  if (!hash.startsWith("0x")) return { confirmed: false };

  const timeoutMs = options?.timeoutMs ?? 120_000;
  const pollMs = options?.pollMs ?? 2_500;
  const client = getPublicClient();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const receipt = await client.getTransactionReceipt({ hash: hash as `0x${string}` });
      if (receipt) {
        return {
          confirmed: receipt.status === "success",
          reverted: receipt.status === "reverted",
        };
      }
    } catch {
      /* receipt not yet available */
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  return { confirmed: false };
}

export async function isOnChainTxConfirmed(txHash: string): Promise<boolean> {
  const result = await waitForOnChainTxConfirmation(txHash, { timeoutMs: 4_000, pollMs: 800 });
  return result.confirmed;
}
