import { type Address } from "viem";
import { getPublicClient } from "./publicClient";

const TREASURY_ABI = [
  {
    type: "function",
    name: "bucketBalances",
    stateMutability: "view",
    inputs: [{ name: "bucket", type: "uint8" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalTreasuryBalance",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalBurned",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "goldReserveGrams",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const FEE_ROUTER_ABI = [
  {
    type: "function",
    name: "feeRatesBps",
    stateMutability: "view",
    inputs: [{ name: "feeType", type: "uint8" }],
    outputs: [{ type: "uint16" }],
  },
  {
    type: "function",
    name: "computeFee",
    stateMutability: "view",
    inputs: [
      { name: "feeType", type: "uint8" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const PROTOCOL_CONTRACTS = {
  treasury: import.meta.env.VITE_GAT_TREASURY_ADDRESS?.trim() as Address | undefined,
  feeRouter: import.meta.env.VITE_GAT_FEE_ROUTER_ADDRESS?.trim() as Address | undefined,
  stakingPool: import.meta.env.VITE_GAT_STAKING_POOL_ADDRESS?.trim() as Address | undefined,
  investmentVault: import.meta.env.VITE_GAT_INVESTMENT_VAULT_ADDRESS?.trim() as Address | undefined,
  gatToken: import.meta.env.VITE_GAT_TOKEN_ADDRESS?.trim() as Address | undefined,
};

const BUCKET_LABELS = [
  "main",
  "validator",
  "referral",
  "burn",
  "liquidity",
  "insurance",
  "autoDistribution",
] as const;

export type OnChainTreasurySnapshot = {
  configured: boolean;
  totalBalance: string;
  totalBurned: string;
  goldReserveGrams: string;
  buckets: Record<string, string>;
};

export async function readOnChainTreasury(): Promise<OnChainTreasurySnapshot | null> {
  const addr = PROTOCOL_CONTRACTS.treasury;
  if (!addr) return null;

  const client = getPublicClient();

  const [totalBalance, totalBurned, goldReserveGrams, ...bucketReads] = await Promise.all([
    client.readContract({ address: addr, abi: TREASURY_ABI, functionName: "totalTreasuryBalance" }),
    client.readContract({ address: addr, abi: TREASURY_ABI, functionName: "totalBurned" }),
    client.readContract({ address: addr, abi: TREASURY_ABI, functionName: "goldReserveGrams" }),
    ...BUCKET_LABELS.map((_, i) =>
      client.readContract({ address: addr, abi: TREASURY_ABI, functionName: "bucketBalances", args: [i] }),
    ),
  ]);

  const buckets: Record<string, string> = {};
  BUCKET_LABELS.forEach((label, i) => {
    buckets[label] = String(bucketReads[i] ?? 0n);
  });

  return {
    configured: true,
    totalBalance: String(totalBalance),
    totalBurned: String(totalBurned),
    goldReserveGrams: String(goldReserveGrams),
    buckets,
  };
}

export async function readOnChainFeeBps(feeTypeIndex: number): Promise<number | null> {
  const addr = PROTOCOL_CONTRACTS.feeRouter;
  if (!addr) return null;
  const client = getPublicClient();
  const bps = await client.readContract({
    address: addr,
    abi: FEE_ROUTER_ABI,
    functionName: "feeRatesBps",
    args: [feeTypeIndex],
  });
  return Number(bps);
}

export function isProtocolConfigured(): boolean {
  return Boolean(PROTOCOL_CONTRACTS.treasury && PROTOCOL_CONTRACTS.feeRouter);
}
