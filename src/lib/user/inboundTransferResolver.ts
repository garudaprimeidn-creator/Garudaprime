import { formatUnits, isAddress, parseAbiItem, type Address } from "viem";
import { GAT_TOKEN, isGatContractConfigured } from "../web3/gatToken";
import { getPublicClient } from "../web3/publicClient";
import type { InboundTransfer } from "./inboundTransferDetector";

export type EnrichedInboundTransfer = InboundTransfer & {
  fromAddress?: string;
  txHash?: string;
};

const BLOCK_LOOKBACK = 500n;
const MIN_DELTA = 0.000_001;

const amountMatches = (value: bigint, decimals: number, expected: number): boolean => {
  const parsed = parseFloat(formatUnits(value, decimals));
  if (!Number.isFinite(parsed)) return false;
  return Math.abs(parsed - expected) <= Math.max(MIN_DELTA, expected * 0.0001);
};

async function findGatInbound(
  walletAddress: Address,
  expectedAmount: number,
): Promise<{ fromAddress: string; txHash: string } | null> {
  if (!isGatContractConfigured() || !GAT_TOKEN.address) return null;

  const client = getPublicClient();
  const latest = await client.getBlockNumber();
  const fromBlock = latest > BLOCK_LOOKBACK ? latest - BLOCK_LOOKBACK : 0n;

  const logs = await client.getLogs({
    address: GAT_TOKEN.address,
    event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
    args: { to: walletAddress },
    fromBlock,
    toBlock: latest,
  }).catch(() => []);

  const matches = logs
    .filter((log) => amountMatches(log.args.value ?? 0n, GAT_TOKEN.decimals, expectedAmount))
    .sort((a, b) => Number(b.blockNumber ?? 0n) - Number(a.blockNumber ?? 0n));

  const hit = matches[0];
  if (!hit?.transactionHash || !hit.args.from) return null;
  return { fromAddress: hit.args.from, txHash: hit.transactionHash };
}

async function findNativeSdaInbound(
  walletAddress: Address,
  expectedAmount: number,
): Promise<{ fromAddress: string; txHash: string } | null> {
  const client = getPublicClient();
  const latest = await client.getBlockNumber();
  const fromBlock = latest > BLOCK_LOOKBACK ? latest - BLOCK_LOOKBACK : 0n;

  for (let blockNumber = latest; blockNumber >= fromBlock; blockNumber -= 1n) {
    const block = await client.getBlock({ blockNumber, includeTransactions: true }).catch(() => null);
    if (!block?.transactions?.length) continue;

    for (const tx of block.transactions) {
      if (typeof tx === "string") continue;
      if (tx.to?.toLowerCase() !== walletAddress.toLowerCase()) continue;
      const amount = parseFloat(formatUnits(tx.value, 18));
      if (!Number.isFinite(amount) || !amountMatches(tx.value, 18, expectedAmount)) continue;
      return { fromAddress: tx.from, txHash: tx.hash };
    }
  }

  return null;
}

export async function resolveInboundTransferSource(
  walletAddress: string,
  inbound: InboundTransfer,
): Promise<{ fromAddress?: string; txHash?: string }> {
  if (!isAddress(walletAddress)) return {};

  const address = walletAddress as Address;
  if (inbound.symbol === "GAT") {
    return (await findGatInbound(address, inbound.amount)) ?? {};
  }
  return (await findNativeSdaInbound(address, inbound.amount)) ?? {};
}

export async function enrichInboundTransfers(
  walletAddress: string,
  inbounds: InboundTransfer[],
): Promise<EnrichedInboundTransfer[]> {
  return Promise.all(inbounds.map(async (inbound) => ({
    ...inbound,
    ...(await resolveInboundTransferSource(walletAddress, inbound)),
  })));
}

export function parseTxTokenAmount(amount: string | null | undefined): { value: number; symbol: "GAT" | "SDA" } | null {
  const match = (amount ?? "").trim().match(/^([+-]?[\d.,]+)\s+(GAT|SDA)$/i);
  if (!match) return null;
  const value = parseFloat(match[1].replace(/,/g, ""));
  const symbol = match[2].toUpperCase() as "GAT" | "SDA";
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, symbol };
}

export const GENERIC_INBOUND_LABEL = "Transfer masuk";

export function isGenericInboundLabel(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === GENERIC_INBOUND_LABEL.toLowerCase()
    || normalized === "incoming transfer";
}
