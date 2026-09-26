import {
  decodeEventLog,
  encodeFunctionData,
  isAddress,
  parseUnits,
  type Address,
  type Hash,
} from "viem";
import { ERC20_ABI } from "./contracts/erc20Abi";
import { GAT_TOKEN, isGatContractConfigured } from "./gatToken";
import { INVESTMENT_VAULT_ABI, STAKING_POOL_ABI } from "./protocolAbis";
import { PROTOCOL_CONTRACTS, isProtocolConfigured } from "./protocolContracts";
import { getPublicClient } from "./publicClient";
import { ensureSignerForAddress } from "./walletProviderResolution";
import type { WalletProvider } from "./walletService";

export type OnChainProtocolTx = {
  txHash: Hash | null;
  simulated: boolean;
};

export type OnChainInvestResult = OnChainProtocolTx & {
  positionId: number | null;
};

export type OnChainStakeResult = OnChainProtocolTx & {
  stakeId: number | null;
};

async function sendTx(
  from: string,
  to: `0x${string}`,
  data: `0x${string}`,
  provider?: WalletProvider,
): Promise<Hash> {
  const eth = await ensureSignerForAddress(from, provider);
  return (await eth.request({
    method: "eth_sendTransaction",
    params: [{ from, to, data }],
  })) as Hash;
}

async function ensureGatAllowance(
  owner: string,
  spender: Address,
  amount: bigint,
  provider?: WalletProvider,
) {
  if (!GAT_TOKEN.address) throw new Error("GAT not configured");
  const client = getPublicClient();
  const allowance = await client.readContract({
    address: GAT_TOKEN.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner as Address, spender],
  });
  if (allowance >= amount) return;

  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
  });
  await sendTx(owner, GAT_TOKEN.address, data, provider);
}

function parseEventId(
  logs: { address: Address; data: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]] | [] }[],
  contract: Address,
  eventName: "Invested" | "Staked",
  abi: typeof INVESTMENT_VAULT_ABI | typeof STAKING_POOL_ABI,
  idField: "positionId" | "stakeId",
): number | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== contract.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi, ...log });
      if (decoded.eventName !== eventName) continue;
      const id = decoded.args[idField];
      return typeof id === "bigint" ? Number(id) : null;
    } catch {
      /* not this event */
    }
  }
  return null;
}

async function waitForProtocolId(
  txHash: Hash,
  contract: Address,
  eventName: "Invested" | "Staked",
  abi: typeof INVESTMENT_VAULT_ABI | typeof STAKING_POOL_ABI,
  idField: "positionId" | "stakeId",
): Promise<number | null> {
  const receipt = await getPublicClient().waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("On-chain transaction failed");
  }
  return parseEventId(receipt.logs, contract, eventName, abi, idField);
}

export async function readFundAprBps(fundId: number): Promise<number | null> {
  const vault = PROTOCOL_CONTRACTS.investmentVault;
  if (!vault) return null;
  const bps = await getPublicClient().readContract({
    address: vault,
    abi: INVESTMENT_VAULT_ABI,
    functionName: "fundAprBps",
    args: [BigInt(fundId)],
  });
  return Number(bps);
}

export async function stakeGatOnChain(
  owner: string,
  amountGat: number,
  lockDays: number,
  provider?: WalletProvider,
): Promise<OnChainStakeResult> {
  if (!isGatContractConfigured() || !isProtocolConfigured() || !PROTOCOL_CONTRACTS.stakingPool) {
    return { txHash: null, stakeId: null, simulated: true };
  }

  const pool = PROTOCOL_CONTRACTS.stakingPool;
  const value = parseUnits(String(amountGat), GAT_TOKEN.decimals);
  await ensureGatAllowance(owner, pool, value, provider);

  const data = encodeFunctionData({
    abi: STAKING_POOL_ABI,
    functionName: "stake",
    args: [value, BigInt(lockDays)],
  });
  const txHash = await sendTx(owner, pool, data, provider);
  const stakeId = await waitForProtocolId(txHash, pool, "Staked", STAKING_POOL_ABI, "stakeId");
  if (stakeId === null) throw new Error("Stake confirmed but stakeId not found in logs");
  return { txHash, stakeId, simulated: false };
}

export async function unstakeGatOnChain(
  owner: string,
  stakeId: number,
  provider?: WalletProvider,
): Promise<OnChainProtocolTx> {
  if (!isProtocolConfigured() || !PROTOCOL_CONTRACTS.stakingPool) {
    return { txHash: null, simulated: true };
  }

  const pool = PROTOCOL_CONTRACTS.stakingPool;
  const data = encodeFunctionData({
    abi: STAKING_POOL_ABI,
    functionName: "unstake",
    args: [BigInt(stakeId)],
  });
  const txHash = await sendTx(owner, pool, data, provider);
  const receipt = await getPublicClient().waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error("Unstake transaction failed");
  return { txHash, simulated: false };
}

export async function investGatOnChain(
  owner: string,
  fundId: number,
  amountGat: number,
  provider?: WalletProvider,
): Promise<OnChainInvestResult> {
  if (!isGatContractConfigured() || !isProtocolConfigured() || !PROTOCOL_CONTRACTS.investmentVault) {
    return { txHash: null, positionId: null, simulated: true };
  }

  const apr = await readFundAprBps(fundId);
  if (!apr || apr <= 0) {
    throw new Error("Fund belum dikonfigurasi di kontrak investasi");
  }

  const vault = PROTOCOL_CONTRACTS.investmentVault;
  const value = parseUnits(String(amountGat), GAT_TOKEN.decimals);
  await ensureGatAllowance(owner, vault, value, provider);

  const data = encodeFunctionData({
    abi: INVESTMENT_VAULT_ABI,
    functionName: "invest",
    args: [BigInt(fundId), value],
  });
  const txHash = await sendTx(owner, vault, data, provider);
  const positionId = await waitForProtocolId(txHash, vault, "Invested", INVESTMENT_VAULT_ABI, "positionId");
  if (positionId === null) throw new Error("Invest confirmed but positionId not found in logs");
  return { txHash, positionId, simulated: false };
}

export async function redeemInvestOnChain(
  owner: string,
  positionId: number,
  provider?: WalletProvider,
): Promise<OnChainProtocolTx> {
  if (!isProtocolConfigured() || !PROTOCOL_CONTRACTS.investmentVault) {
    return { txHash: null, simulated: true };
  }

  const vault = PROTOCOL_CONTRACTS.investmentVault;
  const data = encodeFunctionData({
    abi: INVESTMENT_VAULT_ABI,
    functionName: "redeem",
    args: [BigInt(positionId)],
  });
  const txHash = await sendTx(owner, vault, data, provider);
  const receipt = await getPublicClient().waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error("Redeem transaction failed");
  return { txHash, simulated: false };
}

export function canUseOnChainProtocol(walletAddress?: string | null): boolean {
  return Boolean(walletAddress && isAddress(walletAddress) && isProtocolConfigured() && isGatContractConfigured());
}
