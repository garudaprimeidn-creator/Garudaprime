import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEventLogs,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "./firebaseAdmin.js";
import { GARUDA_RPC_BACKEND } from "./garudaRpcCore.js";

const BRIDGE_VAULT_ABI = [
  {
    type: "event",
    name: "Locked",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "depositId", type: "bytes32", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

const GAT_MINT_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const sidraRpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";

const sidraChain = defineChain({
  id: Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453,
  name: "Sidra",
  nativeCurrency: { name: "SDA", symbol: "SDA", decimals: 18 },
  rpcUrls: { default: { http: [sidraRpc] } },
});

const garudaChain = defineChain({
  id: Number(process.env.VITE_GARUDA_CHAIN_ID) || 8846,
  name:
    (process.env.VITE_GARUDA_CHAIN_STATUS || "").trim().toLowerCase() === "mainnet"
      ? "Garuda Mainnet"
      : "Garuda Testnet",
  nativeCurrency: { name: "GAT", symbol: "GAT", decimals: 18 },
  rpcUrls: { default: { http: [GARUDA_RPC_BACKEND] } },
});

export type BridgeMintBody = {
  depositId: string;
  lockTxHash: string;
  recipient: string;
};

const isGarudaMainnet = () =>
  (process.env.VITE_GARUDA_CHAIN_STATUS || "").trim().toLowerCase() === "mainnet";

const garudaGatAddress = () => {
  if (isGarudaMainnet()) {
    return (
      process.env.GARUDA_MAINNET_GAT_ADDRESS?.trim() ||
      process.env.VITE_GARUDA_MAINNET_GAT_ADDRESS?.trim()
    );
  }
  return (
    process.env.GARUDA_TESTNET_GAT_ADDRESS?.trim() ||
    process.env.VITE_GARUDA_TESTNET_GAT_ADDRESS?.trim()
  );
};

const garudaMinterKey = () => {
  if (isGarudaMainnet()) {
    return (
      process.env.GARUDA_MAINNET_MINTER_PRIVATE_KEY?.trim() ||
      process.env.GARUDA_TESTNET_MINTER_PRIVATE_KEY?.trim()
    );
  }
  return process.env.GARUDA_TESTNET_MINTER_PRIVATE_KEY?.trim();
};

const sidraClient = () =>
  createPublicClient({
    chain: sidraChain,
    transport: http(sidraRpc),
  });

const garudaWallet = () => {
  const key = garudaMinterKey();
  if (!key?.startsWith("0x")) throw new Error("Bridge minter not configured");
  const account = privateKeyToAccount(key as Hex);
  const client = createWalletClient({
    account,
    chain: garudaChain,
    transport: http(GARUDA_RPC_BACKEND),
  });
  return { client, account };
};

const garudaPublic = () =>
  createPublicClient({
    chain: garudaChain,
    transport: http(GARUDA_RPC_BACKEND),
  });

export const relayBridgeMint = async (body: BridgeMintBody, uid: string) => {
  const vault =
    process.env.GAT_BRIDGE_VAULT_ADDRESS?.trim() ||
    process.env.VITE_GAT_BRIDGE_VAULT_ADDRESS?.trim();
  const gatGaruda = garudaGatAddress();

  if (!body?.depositId?.startsWith("0x") || body.depositId.length !== 66) {
    throw new Error("Invalid depositId");
  }
  if (!body?.lockTxHash?.startsWith("0x") || body.lockTxHash.length !== 66) {
    throw new Error("Invalid lockTxHash");
  }
  if (!body?.recipient?.startsWith("0x") || body.recipient.length !== 42) {
    throw new Error("Invalid recipient");
  }
  if (!vault || !gatGaruda) throw new Error("Bridge not configured");

  const claimRef = adminDb().collection("bridge_claims").doc(body.depositId.toLowerCase());
  const existing = await claimRef.get();
  if (existing.exists) {
    const data = existing.data()!;
    if (data.status === "minted") {
      return { depositId: body.depositId, mintTxHash: data.mintTxHash as string, status: "minted" as const };
    }
    throw new Error("Claim already processing");
  }

  const receipt = await sidraClient().getTransactionReceipt({ hash: body.lockTxHash as Hash });
  if (!receipt || receipt.status !== "success") throw new Error("Lock transaction not found");

  const vaultLower = vault.toLowerCase();
  const lockedEvents = parseEventLogs({
    abi: BRIDGE_VAULT_ABI,
    logs: receipt.logs,
    eventName: "Locked",
  }).filter((log) => log.address.toLowerCase() === vaultLower);

  const match = lockedEvents.find(
    (event) =>
      event.args.depositId.toLowerCase() === body.depositId.toLowerCase() &&
      event.args.user.toLowerCase() === body.recipient.toLowerCase(),
  );

  if (!match) throw new Error("Lock event not found");

  const amount = match.args.amount;
  const depositId = match.args.depositId;
  const user = match.args.user.toLowerCase();

  if (depositId.toLowerCase() !== body.depositId.toLowerCase()) throw new Error("DepositId mismatch");
  if (user !== body.recipient.toLowerCase()) throw new Error("Recipient mismatch");

  await claimRef.set({
    uid,
    depositId: body.depositId.toLowerCase(),
    lockTxHash: body.lockTxHash.toLowerCase(),
    recipient: body.recipient.toLowerCase(),
    amount: amount.toString(),
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });

  const { client: wallet, account } = garudaWallet();
  const mintTxHash = await wallet.writeContract({
    chain: garudaChain,
    account,
    address: gatGaruda as Hex,
    abi: GAT_MINT_ABI,
    functionName: "mint",
    args: [body.recipient as Hex, amount],
  });

  await garudaPublic().waitForTransactionReceipt({ hash: mintTxHash });

  await claimRef.update({
    status: "minted",
    mintTxHash,
    mintedAt: FieldValue.serverTimestamp(),
  });

  return { depositId: body.depositId, mintTxHash, status: "minted" as const, amount: amount.toString() };
};

export const verifyAuth = async (header?: string) => {
  if (!header?.startsWith("Bearer ")) throw new Error("Unauthorized");
  return adminAuth().verifyIdToken(header.slice(7));
};

export const bridgeErrorStatus = (message: string): number => {
  if (message === "Unauthorized") return 401;
  if (message.includes("Invalid") || message.includes("mismatch") || message.includes("not found")) return 400;
  if (message.includes("not configured")) return 503;
  return 500;
};
