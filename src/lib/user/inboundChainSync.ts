import { formatUnits, isAddress, parseAbiItem, type Address } from "viem";
import { GAT_TOKEN, isGatContractConfigured } from "../web3/gatToken";
import { getPublicClient } from "../web3/publicClient";
import type { Tx } from "../../app/appTypes";

const CURSOR_PREFIX = "garuda_inbound_cursor";
const BLOCK_LOOKBACK = 2_000n;
const MIN_VALUE = 0.000_001;

export type ChainInboundEvent = {
  symbol: "GAT" | "SDA";
  amount: number;
  fromAddress: string;
  txHash: string;
  blockNumber: bigint;
};

function cursorKey(address: string): string {
  return `${CURSOR_PREFIX}_${address.toLowerCase()}`;
}

function loadCursor(address: string): bigint | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(cursorKey(address));
    if (!raw) return null;
    const n = BigInt(raw);
    return n >= 0n ? n : null;
  } catch {
    return null;
  }
}

function saveCursor(address: string, blockNumber: bigint): void {
  if (typeof localStorage === "undefined" || !address) return;
  localStorage.setItem(cursorKey(address), blockNumber.toString());
}

const parseAmount = (value: bigint, decimals: number): number => {
  const n = parseFloat(formatUnits(value, decimals));
  return Number.isFinite(n) ? n : 0;
};

async function fetchGatInboundEvents(
  walletAddress: Address,
  fromBlock: bigint,
  toBlock: bigint,
  knownHashes: Set<string>,
): Promise<ChainInboundEvent[]> {
  if (!isGatContractConfigured() || !GAT_TOKEN.address) return [];

  const client = getPublicClient();
  const logs = await client.getLogs({
    address: GAT_TOKEN.address,
    event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
    args: { to: walletAddress },
    fromBlock,
    toBlock,
  }).catch(() => []);

  const events: ChainInboundEvent[] = [];
  for (const log of logs) {
    const txHash = log.transactionHash;
    const from = log.args.from;
    const value = log.args.value ?? 0n;
    if (!txHash || !from) continue;
    if (knownHashes.has(txHash.toLowerCase())) continue;
    const amount = parseAmount(value, GAT_TOKEN.decimals);
    if (amount < MIN_VALUE) continue;
    events.push({
      symbol: "GAT",
      amount,
      fromAddress: from,
      txHash,
      blockNumber: log.blockNumber ?? 0n,
    });
  }
  return events;
}

async function fetchSdaInboundEvents(
  walletAddress: Address,
  fromBlock: bigint,
  toBlock: bigint,
  knownHashes: Set<string>,
): Promise<ChainInboundEvent[]> {
  const client = getPublicClient();
  const events: ChainInboundEvent[] = [];

  for (let blockNumber = toBlock; blockNumber >= fromBlock; blockNumber -= 1n) {
    const block = await client.getBlock({ blockNumber, includeTransactions: true }).catch(() => null);
    if (!block?.transactions?.length) continue;

    for (const tx of block.transactions) {
      if (typeof tx === "string") continue;
      if (tx.to?.toLowerCase() !== walletAddress.toLowerCase()) continue;
      if (!tx.hash || knownHashes.has(tx.hash.toLowerCase())) continue;
      const amount = parseAmount(tx.value, 18);
      if (amount < MIN_VALUE) continue;
      events.push({
        symbol: "SDA",
        amount,
        fromAddress: tx.from,
        txHash: tx.hash,
        blockNumber,
      });
    }
  }

  return events;
}

/** Scan on-chain history for inbound GAT/SDA not yet in local tx list. */
export async function fetchNewChainInboundEvents(
  walletAddress: string,
  existing: Tx[],
): Promise<ChainInboundEvent[]> {
  if (!isAddress(walletAddress)) return [];

  const address = walletAddress as Address;
  const knownHashes = new Set(
    existing.map((tx) => tx.txHash?.trim().toLowerCase()).filter(Boolean) as string[],
  );

  const client = getPublicClient();
  const latest = await client.getBlockNumber().catch(() => null);
  if (latest === null) return [];

  const stored = loadCursor(walletAddress);
  const lookbackStart = latest > BLOCK_LOOKBACK ? latest - BLOCK_LOOKBACK : 0n;
  const fromBlock = stored !== null
    ? (stored > lookbackStart ? stored + 1n : lookbackStart)
    : lookbackStart;

  if (fromBlock > latest) return [];

  const [gatEvents, sdaEvents] = await Promise.all([
    fetchGatInboundEvents(address, fromBlock, latest, knownHashes),
    fetchSdaInboundEvents(address, fromBlock, latest, knownHashes),
  ]);

  const merged = [...gatEvents, ...sdaEvents].sort(
    (a, b) => Number(a.blockNumber) - Number(b.blockNumber),
  );

  if (merged.length) {
    const maxBlock = merged.reduce((max, ev) => (ev.blockNumber > max ? ev.blockNumber : max), 0n);
    if (maxBlock > 0n) saveCursor(walletAddress, maxBlock);
  } else if (latest > 0n) {
    saveCursor(walletAddress, latest);
  }

  return merged;
}
