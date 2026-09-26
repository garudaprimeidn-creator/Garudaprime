/**
 * On-chain balance reads for embedded / linked wallets (ADR-005 Fase 2).
 */
import { createPublicClient, formatUnits, http, type Address, type Hex } from "viem";
import { adminDb } from "./firebaseAdmin.js";
import { resolveUidFromWalletAddress } from "./walletIdentityCore.js";
import {
  derivedGarudaWalletAddress,
  isGarudaNativeWalletEnabled,
} from "./garudaWalletCore.js";
import { isFirestoreQuotaError } from "./firestoreQuota.js";

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const sidraRpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
const sidraChainId = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;

function gatTokenAddress(): Address | null {
  const raw = process.env.VITE_GAT_TOKEN_ADDRESS?.trim() || process.env.GAT_TOKEN_ADDRESS?.trim();
  return raw?.startsWith("0x") ? (raw as Address) : null;
}

function gatDecimals(): number {
  const n = Number(process.env.VITE_GAT_TOKEN_DECIMALS ?? 18);
  return Number.isFinite(n) && n > 0 ? n : 18;
}

function publicClient() {
  return createPublicClient({
    chain: {
      id: sidraChainId,
      name: "Sidra",
      nativeCurrency: { name: "SDA", symbol: "SDA", decimals: 18 },
      rpcUrls: { default: { http: [sidraRpc] } },
    },
    transport: http(sidraRpc),
  });
}

export async function resolvePrimaryWalletForUid(uid: string): Promise<string | null> {
  try {
    const db = adminDb();

    const profileSnap = await db.collection("users").doc(uid).get();
    const profileAddr = String(profileSnap.data()?.walletAddress ?? "").trim();
    if (profileAddr.startsWith("0x")) return profileAddr;

    const linkedSnap = await db.collection("connected_wallets")
      .where("uid", "==", uid)
      .limit(5)
      .get();

    for (const doc of linkedSnap.docs) {
      const addr = String(doc.data().walletAddress ?? "").trim();
      if (addr.startsWith("0x")) return addr;
    }

    return null;
  } catch (err) {
    if (isFirestoreQuotaError(err) && isGarudaNativeWalletEnabled()) {
      return derivedGarudaWalletAddress(uid);
    }
    throw err;
  }
}

export async function getOnChainGatBalance(walletAddress: string): Promise<number> {
  const token = gatTokenAddress();
  if (!token || !walletAddress.startsWith("0x")) return 0;

  const client = publicClient();
  const balance = await client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [walletAddress as Address],
  });

  const amount = Number(formatUnits(balance, gatDecimals()));
  return Number.isFinite(amount) ? amount : 0;
}

export async function getEmbeddedGatBalanceForUid(uid: string): Promise<{
  walletAddress: string | null;
  gatBalance: number;
}> {
  const walletAddress = await resolvePrimaryWalletForUid(uid);
  if (!walletAddress) return { walletAddress: null, gatBalance: 0 };
  const gatBalance = await getOnChainGatBalance(walletAddress);
  return { walletAddress, gatBalance };
}

export async function getOnChainTxReceipt(txHash: string) {
  const hash = txHash.trim() as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;

  const client = publicClient();
  const receipt = await client.getTransactionReceipt({ hash }).catch(() => null);
  if (!receipt) return null;

  return {
    txHash: hash,
    blockNumber: Number(receipt.blockNumber),
    status: receipt.status === "success" ? "confirmed" as const : "failed" as const,
    from: receipt.from,
    to: receipt.to,
  };
}

export async function uidFromWalletAddress(address: string): Promise<string | null> {
  return resolveUidFromWalletAddress(address);
}
