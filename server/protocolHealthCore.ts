import {
  createPublicClient,
  formatUnits,
  http,
  type Address,
} from "viem";

const sidraRpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
const sidraChainId = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;

const GAT_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const VAULT_ABI = [
  {
    type: "function",
    name: "totalPrincipal",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "fundAprBps",
    stateMutability: "view",
    inputs: [{ name: "fundId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const;

const STAKING_ABI = [
  {
    type: "function",
    name: "totalStaked",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const;

const FUND_IDS = [1, 2, 3, 4] as const;

function gatDecimals(): number {
  const n = Number(process.env.VITE_GAT_TOKEN_DECIMALS ?? 18);
  return Number.isFinite(n) && n > 0 ? n : 18;
}

function gatTokenAddress(): Address | null {
  const raw = process.env.VITE_GAT_TOKEN_ADDRESS?.trim();
  return raw?.startsWith("0x") ? (raw as Address) : null;
}

function investmentVaultAddress(): Address | null {
  const raw = process.env.VITE_GAT_INVESTMENT_VAULT_ADDRESS?.trim();
  return raw?.startsWith("0x") ? (raw as Address) : null;
}

function stakingPoolAddress(): Address | null {
  const raw = process.env.VITE_GAT_STAKING_POOL_ADDRESS?.trim();
  return raw?.startsWith("0x") ? (raw as Address) : null;
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

function toGat(value: bigint): number {
  const n = Number(formatUnits(value, gatDecimals()));
  return Number.isFinite(n) ? n : 0;
}

export type ProtocolPoolHealth = {
  address: string | null;
  balanceGat: number;
  reservedGat: number;
  headroomGat: number;
  paused: boolean;
  healthy: boolean;
};

export type ProtocolFundApr = {
  fundId: number;
  aprBps: number;
  configured: boolean;
};

export type ProtocolHealthReport = {
  ok: boolean;
  configured: boolean;
  chainId: number;
  contracts: {
    gatToken: string | null;
    investmentVault: string | null;
    stakingPool: string | null;
  };
  funds: ProtocolFundApr[];
  investmentVault: ProtocolPoolHealth;
  stakingPool: ProtocolPoolHealth;
  warnings: string[];
  readyForInvest: boolean;
  readyForStake: boolean;
};

export async function getProtocolHealthReport(): Promise<ProtocolHealthReport> {
  const token = gatTokenAddress();
  const vault = investmentVaultAddress();
  const pool = stakingPoolAddress();
  const warnings: string[] = [];

  const emptyPool = (address: string | null): ProtocolPoolHealth => ({
    address,
    balanceGat: 0,
    reservedGat: 0,
    headroomGat: 0,
    paused: false,
    healthy: false,
  });

  if (!token || !vault || !pool) {
    if (!token) warnings.push("GAT token address not configured");
    if (!vault) warnings.push("Investment vault not configured");
    if (!pool) warnings.push("Staking pool not configured");
    return {
      ok: false,
      configured: false,
      chainId: sidraChainId,
      contracts: { gatToken: token, investmentVault: vault, stakingPool: pool },
      funds: FUND_IDS.map((fundId) => ({ fundId, aprBps: 0, configured: false })),
      investmentVault: emptyPool(vault),
      stakingPool: emptyPool(pool),
      warnings,
      readyForInvest: false,
      readyForStake: false,
    };
  }

  const client = publicClient();
  const decimals = gatDecimals();

  const funds: ProtocolFundApr[] = [];
  for (const fundId of FUND_IDS) {
    try {
      const bps = await client.readContract({
        address: vault,
        abi: VAULT_ABI,
        functionName: "fundAprBps",
        args: [BigInt(fundId)],
      });
      const aprBps = Number(bps);
      funds.push({ fundId, aprBps, configured: aprBps > 0 });
      if (aprBps <= 0) warnings.push(`Fund ${fundId} APR belum diset on-chain`);
    } catch {
      funds.push({ fundId, aprBps: 0, configured: false });
      warnings.push(`Fund ${fundId} APR tidak dapat dibaca`);
    }
  }

  let vaultBalanceGat = 0;
  let vaultPrincipalGat = 0;
  let vaultPaused = false;
  try {
    const [bal, principal, paused] = await Promise.all([
      client.readContract({ address: token, abi: GAT_ABI, functionName: "balanceOf", args: [vault] }),
      client.readContract({ address: vault, abi: VAULT_ABI, functionName: "totalPrincipal" }),
      client.readContract({ address: vault, abi: VAULT_ABI, functionName: "paused" }),
    ]);
    vaultBalanceGat = toGat(bal);
    vaultPrincipalGat = toGat(principal);
    vaultPaused = paused;
  } catch {
    warnings.push("Investment vault metrics tidak dapat dibaca");
  }

  let poolBalanceGat = 0;
  let poolStakedGat = 0;
  let poolPaused = false;
  try {
    const [bal, staked, paused] = await Promise.all([
      client.readContract({ address: token, abi: GAT_ABI, functionName: "balanceOf", args: [pool] }),
      client.readContract({ address: pool, abi: STAKING_ABI, functionName: "totalStaked" }),
      client.readContract({ address: pool, abi: STAKING_ABI, functionName: "paused" }),
    ]);
    poolBalanceGat = toGat(bal);
    poolStakedGat = toGat(staked);
    poolPaused = paused;
  } catch {
    warnings.push("Staking pool metrics tidak dapat dibaca");
  }

  const vaultHeadroom = vaultBalanceGat - vaultPrincipalGat;
  const poolHeadroom = poolBalanceGat - poolStakedGat;

  const vaultHealthy = !vaultPaused && vaultHeadroom >= Math.max(vaultPrincipalGat * 0.05, 100);
  const poolHealthy = !poolPaused && poolHeadroom >= Math.max(poolStakedGat * 0.05, 50);

  if (vaultPaused) warnings.push("Investment vault paused");
  if (poolPaused) warnings.push("Staking pool paused");
  if (!vaultHealthy && vaultPrincipalGat > 0) {
    warnings.push("ROI pool vault rendah, redeem bisa gagal");
  }
  if (!poolHealthy && poolStakedGat > 0) {
    warnings.push("Reward pool staking rendah, unstake bisa gagal");
  }
  if (vaultPrincipalGat === 0 && vaultBalanceGat < 1000) {
    warnings.push("Jalankan npm run setup:protocol di folder contracts untuk isi ROI pool");
  }
  if (poolStakedGat === 0 && poolBalanceGat < 500) {
    warnings.push("Jalankan npm run setup:protocol di folder contracts untuk isi reward pool");
  }

  const fundsReady = funds.some((f) => f.configured);
  const readyForInvest = fundsReady && !vaultPaused && vaultBalanceGat > 0;
  const readyForStake = !poolPaused && poolBalanceGat > 0;

  return {
    ok: warnings.length === 0,
    configured: true,
    chainId: sidraChainId,
    contracts: { gatToken: token, investmentVault: vault, stakingPool: pool },
    funds,
    investmentVault: {
      address: vault,
      balanceGat: vaultBalanceGat,
      reservedGat: vaultPrincipalGat,
      headroomGat: vaultHeadroom,
      paused: vaultPaused,
      healthy: vaultHealthy,
    },
    stakingPool: {
      address: pool,
      balanceGat: poolBalanceGat,
      reservedGat: poolStakedGat,
      headroomGat: poolHeadroom,
      paused: poolPaused,
      healthy: poolHealthy,
    },
    warnings,
    readyForInvest,
    readyForStake,
  };
}
