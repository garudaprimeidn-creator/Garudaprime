/**
 * Reliable Garuda native wallet tx broadcast, gas bump, nonce replace, wait for receipt.
 */
import {
  createPublicClient,
  http,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { type PrivateKeyAccount } from "viem/accounts";

const sidraRpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
const sidraChainId = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;

function chain() {
  return {
    id: sidraChainId,
    name: "Sidra",
    nativeCurrency: { name: "SDA", symbol: "SDA", decimals: 18 },
    rpcUrls: { default: { http: [sidraRpc] } },
  } as const;
}

function gasPriceMultiplierBps(): bigint {
  const n = Number(process.env.GARUDA_TX_GAS_PRICE_MULTIPLIER_BPS ?? 14500);
  return BigInt(Number.isFinite(n) && n >= 10_000 ? Math.floor(n) : 14_500);
}

function replaceGasPriceMultiplierBps(): bigint {
  const n = Number(process.env.GARUDA_TX_REPLACE_GAS_MULTIPLIER_BPS ?? 17500);
  return BigInt(Number.isFinite(n) && n >= 10_000 ? Math.floor(n) : 17_500);
}

function receiptTimeoutMs(): number {
  /** 0 = return immediately after broadcast; client polls confirmation. */
  const n = Number(process.env.GARUDA_TX_RECEIPT_TIMEOUT_MS ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseHexValue(value?: string): bigint {
  if (!value) return 0n;
  const v = value.trim();
  if (v === "0x" || v === "0x0") return 0n;
  return BigInt(v);
}

export type GarudaBroadcastInput = {
  account: PrivateKeyAccount;
  to: Hex;
  data?: Hex;
  value?: bigint;
  gas?: bigint;
  gasPrice?: bigint;
  nonce?: number;
};

export type GarudaBroadcastResult = {
  txHash: Hash;
  blockNumber?: bigint;
  /** True when hash returned but receipt not yet mined within timeout. */
  pending?: boolean;
};

export async function broadcastGarudaTransaction(
  walletClient: {
    sendTransaction: (args: Record<string, unknown>) => Promise<Hash>;
  },
  input: GarudaBroadcastInput,
): Promise<GarudaBroadcastResult> {
  const publicClient = createPublicClient({ chain: chain(), transport: http(sidraRpc) });
  const owner = input.account.address as Address;

  const [confirmedNonce, pendingNonce, networkGasPrice] = await Promise.all([
    publicClient.getTransactionCount({ address: owner, blockTag: "latest" }),
    publicClient.getTransactionCount({ address: owner, blockTag: "pending" }),
    publicClient.getGasPrice(),
  ]);

  const replacingPending = pendingNonce > confirmedNonce;
  const nonce = input.nonce ?? confirmedNonce;
  const multiplier = replacingPending ? replaceGasPriceMultiplierBps() : gasPriceMultiplierBps();
  const gasPrice = input.gasPrice ?? (networkGasPrice * multiplier) / 10_000n;

  let gas = input.gas;
  if (!gas) {
    gas = await publicClient.estimateGas({
      account: owner,
      to: input.to,
      data: input.data,
      value: input.value ?? 0n,
    }).catch(() => 120_000n);
    gas = (gas * 12n) / 10n;
  }

  const hash = await walletClient.sendTransaction({
    account: input.account,
    chain: chain(),
    to: input.to,
    data: input.data,
    value: input.value ?? 0n,
    gas,
    gasPrice,
    nonce,
  });

  const waitMs = receiptTimeoutMs();
  if (waitMs <= 0) {
    return { txHash: hash, pending: true };
  }

  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: receiptTimeoutMs(),
    });
    if (receipt.status === "reverted") {
      throw new Error("Transaksi on-chain gagal (reverted), coba lagi");
    }
    return { txHash: hash, blockNumber: receipt.blockNumber, pending: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    if (msg.includes("timeout") || msg.includes("timed out")) {
      return { txHash: hash, pending: true };
    }
    throw err;
  }
}

export { parseHexValue, chain as garudaSidraChain, sidraRpc as garudaSidraRpc };
