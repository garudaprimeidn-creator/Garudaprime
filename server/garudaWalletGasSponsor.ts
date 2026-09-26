/**
 * Gas sponsorship for Garuda Native Wallet txs (Phase 2).
 */
import {
  createPublicClient,
  formatEther,
  http,
  type Hex,
} from "viem";
import { isRelayerPaymasterEnabled, relayerSendNativeSda } from "./payRelayerCore.js";
import { adminDb } from "./firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";
import { isFirestoreQuotaError } from "./firestoreQuota.js";

const sidraRpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
const sidraChainId = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Relayer hard cap, must match payRelayerCore.relayerSendNativeSda (<= 0.2). */
const RELAYER_MAX_SDA_PER_TX = 0.19;

function sidraChain() {
  return {
    id: sidraChainId,
    name: "Sidra",
    nativeCurrency: { name: "SDA", symbol: "SDA", decimals: 18 },
    rpcUrls: { default: { http: [sidraRpc] } },
  } as const;
}

function minSdaBalance(): number {
  const n = Number(process.env.WALLET_ACTIVATION_SKIP_BALANCE_SDA ?? 0.05);
  return Number.isFinite(n) && n > 0 ? n : 0.05;
}

function sponsorAmount(): number {
  const n = Number(process.env.WALLET_ACTIVATION_SDA_AMOUNT ?? 0.08);
  return Number.isFinite(n) && n > 0 ? Math.min(n, RELAYER_MAX_SDA_PER_TX) : 0.08;
}

function parseHexValue(value?: string): bigint {
  if (!value) return 0n;
  const v = value.trim();
  if (v === "0x" || v === "0x0") return 0n;
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

export function isInsufficientGasError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes("insufficient funds")
    || msg.includes("exceeds the balance")
    || msg.includes("gas * gas fee")
    || msg.includes("overshot");
}

export const GARUDA_GAS_USER_MESSAGE =
  "Saldo SDA tidak cukup untuk biaya jaringan Sidra, gas sedang disponsori, coba lagi dalam beberapa detik.";

async function readNativeSda(address: string): Promise<number> {
  const client = createPublicClient({
    chain: sidraChain(),
    transport: http(sidraRpc),
  });
  const wei = await client.getBalance({ address: address as Hex });
  return Number(formatEther(wei));
}

async function waitForTopUpReceipt(_txHash: string): Promise<void> {
  await sleep(600);
}

async function waitForMinSdaBalance(
  address: string,
  required: number,
  timeoutMs = 5_000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let balance = await readNativeSda(address);
  while (balance + 1e-9 < required && Date.now() < deadline) {
    await sleep(450);
    balance = await readNativeSda(address);
  }
  return balance;
}

/** Send SDA in relayer-safe chunks (max 0.19 SDA each). */
async function sendSdaTopUpInChunks(
  walletAddress: string,
  totalSda: number,
): Promise<string | undefined> {
  let remaining = Math.max(0, totalSda);
  let lastTxHash: string | undefined;

  while (remaining > 0.002) {
    const chunk = Math.min(remaining, RELAYER_MAX_SDA_PER_TX);
    lastTxHash = await relayerSendNativeSda({
      toAddress: walletAddress,
      amountSda: chunk,
    });
    await waitForTopUpReceipt(lastTxHash);
    remaining -= chunk;
  }

  return lastTxHash;
}

/** Estimate native SDA cost for a Garuda wallet transaction (incl. buffer). */
export async function estimateGarudaTxGasSda(
  walletAddress: string,
  tx: { to?: string; data?: string; value?: string },
): Promise<number> {
  if (!walletAddress.startsWith("0x") || !tx.to?.startsWith("0x")) {
    return 0.06;
  }
  try {
    const client = createPublicClient({
      chain: sidraChain(),
      transport: http(sidraRpc),
    });
    const gas = await client.estimateGas({
      account: walletAddress as Hex,
      to: tx.to as Hex,
      data: (tx.data as Hex | undefined) ?? undefined,
      value: parseHexValue(tx.value),
    });
    const gasPrice = await client.getGasPrice();
    const costWei = (gas * gasPrice * 15n) / 10n;
    const cost = Number(formatEther(costWei));
    return Number.isFinite(cost) && cost > 0 ? cost : 0.06;
  } catch {
    return 0.06;
  }
}

/** Top-up SDA via relayer when Garuda wallet balance is low (paymaster enabled). */
export async function ensureGarudaWalletGas(input: {
  uid: string;
  walletAddress: string;
  estimatedGasSda?: number;
  /** Reserve headroom for approve + settle (2 on-chain txs). */
  txCount?: number;
}): Promise<{ sponsored: boolean; txHash?: string; balanceSda: number }> {
  const txCount = Math.max(1, Math.min(input.txCount ?? 1, 3));
  const perTx = Math.max(minSdaBalance(), input.estimatedGasSda ?? 0.06);
  const required = perTx * txCount * 1.08 + 0.008;

  let balanceSda = await readNativeSda(input.walletAddress);

  if (!isRelayerPaymasterEnabled()) {
    if (balanceSda + 1e-9 < required) {
      throw new Error(GARUDA_GAS_USER_MESSAGE);
    }
    return { sponsored: false, balanceSda };
  }

  if (balanceSda + 1e-9 >= required) {
    return { sponsored: false, balanceSda };
  }

  let lastTxHash: string | undefined;
  for (let attempt = 0; attempt < 3 && balanceSda + 1e-9 < required; attempt += 1) {
    const deficit = required - balanceSda + 0.012 + attempt * 0.008;
    const topUp = Math.max(sponsorAmount(), deficit);
    lastTxHash = await sendSdaTopUpInChunks(input.walletAddress, topUp);

    try {
      await adminDb().collection("garuda_wallet_gas_grants").add({
        uid: input.uid,
        walletAddress: input.walletAddress.toLowerCase(),
        amountSda: topUp,
        txHash: lastTxHash,
        estimatedGasSda: input.estimatedGasSda ?? null,
        attempt,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      if (!isFirestoreQuotaError(err)) throw err;
    }

    balanceSda = await waitForMinSdaBalance(input.walletAddress, required, 5_000);
  }

  if (balanceSda + 1e-9 < required * 0.85) {
    throw new Error(GARUDA_GAS_USER_MESSAGE);
  }

  return { sponsored: true, txHash: lastTxHash, balanceSda };
}
