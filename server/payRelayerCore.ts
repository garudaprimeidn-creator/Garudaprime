/**
 * Fase 2, Pay Hub relayer: antrian & audit tx on-chain (withdraw GAT).
 * Saat ini eksekusi sinkron; koleksi `pay_relayer_jobs` untuk monitoring & retry.
 */
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  http,
  parseEther,
  parseUnits,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";

const JOBS_COL = "pay_relayer_jobs";

const sidraRpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
const sidraChainId = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;

const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export type RelayerJobType = "withdraw_gat";
export type RelayerJobStatus = "pending" | "processing" | "confirmed" | "failed";

export type RelayerJob = {
  id: string;
  type: RelayerJobType;
  status: RelayerJobStatus;
  uid?: string;
  toAddress: string;
  amountGat: number;
  txHash?: string;
  error?: string;
  idempotencyKey?: string;
  initiatedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function gatTokenAddress(): string | null {
  const raw = process.env.VITE_GAT_TOKEN_ADDRESS?.trim() || process.env.GAT_TOKEN_ADDRESS?.trim();
  return raw?.startsWith("0x") ? raw : null;
}

function treasuryPrivateKey(): string | null {
  const key =
    process.env.PROTOCOL_OWNER_PRIVATE_KEY?.trim()
    || process.env.DEPLOYER_PRIVATE_KEY?.trim();
  return key?.startsWith("0x") ? key : null;
}

function payHubBackingAddress(): string | null {
  const candidates = [
    process.env.VITE_PAY_HUB_BACKING_ADDRESS,
    process.env.PAY_HUB_BACKING_ADDRESS,
    process.env.PROTOCOL_OWNER_ADDRESS,
  ];
  for (const raw of candidates) {
    const v = raw?.trim();
    if (v?.startsWith("0x")) return v.toLowerCase();
  }
  const key = treasuryPrivateKey();
  if (!key) return null;
  return privateKeyToAccount(key as Hex).address.toLowerCase();
}

function gatDecimals(): number {
  const n = Number(process.env.VITE_GAT_TOKEN_DECIMALS ?? 18);
  return Number.isFinite(n) && n > 0 ? n : 18;
}

function maxGatPerTx(): number {
  const n = Number(process.env.RELAYER_MAX_GAT_PER_TX ?? 1_000_000);
  return Number.isFinite(n) && n > 0 ? n : 1_000_000;
}

function chain() {
  return {
    id: sidraChainId,
    name: "Sidra",
    nativeCurrency: { name: "SDA", symbol: "SDA", decimals: 18 },
    rpcUrls: { default: { http: [sidraRpc] } },
  } as const;
}

export function isRelayerConfigured(): boolean {
  return Boolean(gatTokenAddress() && treasuryPrivateKey());
}

/** Fase 4, gas sponsorship policy (aktifkan setelah vendor embedded wallet). */
export function isRelayerPaymasterEnabled(): boolean {
  const raw = process.env.RELAYER_PAYMASTER_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export function relayerMaxGasSponsorPerDay(): number {
  const n = Number(process.env.RELAYER_MAX_GAS_SPONSOR_PER_DAY ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function findJobByIdempotency(key: string): Promise<RelayerJob | null> {
  const snap = await adminDb()
    .collection(JOBS_COL)
    .where("idempotencyKey", "==", key)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Omit<RelayerJob, "id">) };
}

async function sendGatOnSidra(to: string, amountGat: number): Promise<Hash> {
  const token = gatTokenAddress();
  const key = treasuryPrivateKey();
  if (!token || !key) throw new Error("Relayer: on-chain transfer not configured");

  if (amountGat > maxGatPerTx()) {
    throw new Error(`Relayer: amount exceeds RELAYER_MAX_GAT_PER_TX (${maxGatPerTx()})`);
  }

  const account = privateKeyToAccount(key as Hex);
  const wallet = createWalletClient({
    account,
    chain: chain(),
    transport: http(sidraRpc),
  });

  const amountStr = amountGat.toLocaleString("en-US", {
    maximumFractionDigits: 6,
    useGrouping: false,
  });
  const value = parseUnits(amountStr, gatDecimals());
  if (value <= 0n) throw new Error("Invalid transfer amount");

  const hash = await wallet.writeContract({
    chain: chain(),
    account,
    address: token as Hex,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [to as Hex, value],
  });

  return hash;
}

/** Kirim SDA native (aktivasi dompet user, gas untuk approve pertama). */
export async function relayerSendNativeSda(input: {
  toAddress: string;
  amountSda: number;
}): Promise<Hash> {
  const key = treasuryPrivateKey();
  if (!key) throw new Error("Relayer: native transfer not configured");

  if (input.amountSda <= 0 || input.amountSda > 0.2) {
    throw new Error("Relayer: SDA amount must be > 0 and <= 0.2");
  }

  const account = privateKeyToAccount(key as Hex);
  const wallet = createWalletClient({
    account,
    chain: chain(),
    transport: http(sidraRpc),
  });

  const amountStr = input.amountSda.toLocaleString("en-US", {
    maximumFractionDigits: 8,
    useGrouping: false,
  });
  const value = parseEther(amountStr);

  const hash = await wallet.sendTransaction({
    account,
    chain: chain(),
    to: input.toAddress as Hex,
    value,
  });
  return hash;
}

export async function readRelayerNativeBalanceSda(address: string): Promise<number> {
  const client = createPublicClient({ chain: chain(), transport: http(sidraRpc) });
  const wei = await client.getBalance({ address: address as Hex });
  return Number(formatEther(wei));
}

/** Eksekusi withdraw GAT dengan job relayer (idempotency opsional). */
export async function relayerWithdrawGat(input: {
  uid: string;
  toAddress: string;
  amountGat: number;
  initiatedBy: string;
  idempotencyKey?: string;
}): Promise<{ txHash: Hash; jobId: string }> {
  const { uid, toAddress, amountGat, initiatedBy, idempotencyKey } = input;

  if (idempotencyKey) {
    const existing = await findJobByIdempotency(idempotencyKey);
    if (existing?.status === "confirmed" && existing.txHash) {
      return { txHash: existing.txHash as Hash, jobId: existing.id };
    }
    if (existing?.status === "processing") {
      throw new Error("Relayer: withdraw already processing");
    }
  }

  const jobRef = adminDb().collection(JOBS_COL).doc();
  await jobRef.set({
    type: "withdraw_gat",
    status: "pending",
    uid,
    toAddress: toAddress.toLowerCase(),
    amountGat,
    initiatedBy,
    idempotencyKey: idempotencyKey ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await jobRef.update({ status: "processing", updatedAt: FieldValue.serverTimestamp() });

  try {
    const txHash = await sendGatOnSidra(toAddress, amountGat);
    await jobRef.update({
      status: "confirmed",
      txHash,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { txHash, jobId: jobRef.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await jobRef.update({
      status: "failed",
      error: message,
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw err instanceof Error ? err : new Error(message);
  }
}

export async function getRelayerHealth() {
  const db = adminDb();
  const [pending, failed, recent] = await Promise.all([
    db.collection(JOBS_COL).where("status", "==", "pending").count().get(),
    db.collection(JOBS_COL).where("status", "==", "failed").count().get(),
    db.collection(JOBS_COL).orderBy("createdAt", "desc").limit(10).get(),
  ]);

  const token = gatTokenAddress();
  const backing = payHubBackingAddress();
  let backingGat: number | null = null;

  if (token && backing) {
    try {
      const client = createPublicClient({ chain: chain(), transport: http(sidraRpc) });
      const raw = await client.readContract({
        address: token as Hex,
        abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const,
        functionName: "balanceOf",
        args: [backing as Hex],
      });
      backingGat = Number(formatUnits(raw, gatDecimals()));
    } catch {
      backingGat = null;
    }
  }

  const recentJobs: RelayerJob[] = recent.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<RelayerJob, "id">),
  }));

  return {
    configured: isRelayerConfigured(),
    backingAddress: backing,
    backingGat,
    maxGatPerTx: maxGatPerTx(),
    pendingJobs: pending.data().count,
    failedJobs: failed.data().count,
    recentJobs,
  };
}

export async function listFailedRelayerJobs(limit = 20): Promise<RelayerJob[]> {
  const snap = await adminDb()
    .collection(JOBS_COL)
    .where("status", "==", "failed")
    .limit(Math.min(limit, 50))
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<RelayerJob, "id">) }))
    .slice(0, limit);
}
