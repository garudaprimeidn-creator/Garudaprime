import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  UTILITY_NFT_CATEGORY_ID,
  type UtilityNftCategory,
} from "../src/lib/nft/utilityNftTypes.js";

const NFT_ABI = [
  {
    type: "function",
    name: "mintUtility",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "category", type: "uint8" },
      { name: "uri", type: "string" },
      { name: "soulbound", type: "bool" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tokensOfOwner",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "tokenCategory",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "tokenIssuedAt",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
] as const;

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

export function utilityNftContractAddress(): Address | null {
  const raw = process.env.VITE_GARUDA_UTILITY_NFT_ADDRESS?.trim()
    || process.env.GARUDA_UTILITY_NFT_ADDRESS?.trim();
  return raw?.startsWith("0x") ? (raw as Address) : null;
}

export function isUtilityNftOnChainConfigured(): boolean {
  return Boolean(utilityNftContractAddress() && minterKey());
}

function minterKey(): Hex | null {
  const key =
    process.env.UTILITY_NFT_MINTER_PRIVATE_KEY?.trim()
    || process.env.PROTOCOL_OWNER_PRIVATE_KEY?.trim()
    || process.env.DEPLOYER_PRIVATE_KEY?.trim();
  return key?.startsWith("0x") ? (key as Hex) : null;
}

export async function readOnChainUtilityTokens(wallet: Address): Promise<{
  tokenId: string;
  categoryId: number;
  issuedAt: string | null;
}[]> {
  const contract = utilityNftContractAddress();
  if (!contract) return [];

  const client = createPublicClient({ chain: chain(), transport: http(sidraRpc) });
  const ids = await client.readContract({
    address: contract,
    abi: NFT_ABI,
    functionName: "tokensOfOwner",
    args: [wallet],
  }).catch(() => [] as bigint[]);

  const out: { tokenId: string; categoryId: number; issuedAt: string | null }[] = [];
  for (const id of ids) {
    const [categoryId, issuedAt] = await Promise.all([
      client.readContract({
        address: contract,
        abi: NFT_ABI,
        functionName: "tokenCategory",
        args: [id],
      }).catch(() => 0),
      client.readContract({
        address: contract,
        abi: NFT_ABI,
        functionName: "tokenIssuedAt",
        args: [id],
      }).catch(() => 0n),
    ]);
    out.push({
      tokenId: id.toString(),
      categoryId: Number(categoryId),
      issuedAt: issuedAt > 0n ? new Date(Number(issuedAt) * 1000).toISOString() : null,
    });
  }
  return out;
}

export async function mintUtilityNftOnChain(input: {
  to: Address;
  category: UtilityNftCategory;
  tokenUri: string;
  soulbound: boolean;
}): Promise<{ tokenId: string; txHash: Hash }> {
  const contract = utilityNftContractAddress();
  const key = minterKey();
  if (!contract || !key) {
    throw new Error("Utility NFT contract or minter not configured");
  }

  const categoryId = UTILITY_NFT_CATEGORY_ID[input.category];
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({
    account,
    chain: chain(),
    transport: http(sidraRpc),
  });
  const publicClient = createPublicClient({
    chain: chain(),
    transport: http(sidraRpc),
  });

  const hash = await wallet.writeContract({
    chain: chain(),
    account,
    address: contract,
    abi: NFT_ABI,
    functionName: "mintUtility",
    args: [input.to, categoryId, input.tokenUri, input.soulbound],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") {
    throw new Error("Utility NFT mint transaction failed");
  }

  const tokens = await readOnChainUtilityTokens(input.to);
  const match = tokens
    .filter((t) => t.categoryId === categoryId)
    .sort((a, b) => Number(b.tokenId) - Number(a.tokenId))[0];

  return {
    tokenId: match?.tokenId ?? "0",
    txHash: hash,
  };
}

export function categoryFromOnChainId(categoryId: number): UtilityNftCategory | null {
  const entries = Object.entries(UTILITY_NFT_CATEGORY_ID) as [UtilityNftCategory, number][];
  return entries.find(([, id]) => id === categoryId)?.[0] ?? null;
}
