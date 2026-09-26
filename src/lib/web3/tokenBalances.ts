import { formatUnits, getAddress, isAddress, type Address } from "viem";
import { ERC20_ABI } from "./contracts/erc20Abi";
import { GAT_TOKEN, isGatContractConfigured } from "./gatToken";
import { createSidraPublicClient, getPublicClient, SIDRA_RPC_FALLBACKS } from "./publicClient";

export type OnChainBalances = {
  sda: number | null;
  gat: number | null;
  usdx: number | null;
  fetchedAt: number;
};

export const hasLiveBalances = (balances: OnChainBalances) =>
  balances.sda !== null || balances.gat !== null || balances.usdx !== null;

const USDX_TOKEN_ADDRESS = (() => {
  const raw = import.meta.env.VITE_USDX_TOKEN_ADDRESS?.trim();
  return raw && /^0x[a-fA-F0-9]{40}$/.test(raw) ? (raw as Address) : null;
})();

const USDX_DECIMALS = Number(import.meta.env.VITE_USDX_TOKEN_DECIMALS ?? 18) || 18;

const parseBalance = (value: bigint, decimals: number): number => {
  const n = parseFloat(formatUnits(value, decimals));
  return Number.isFinite(n) ? n : 0;
};

const resolveQueryAddress = (walletAddress: string): Address | null => {
  if (!isAddress(walletAddress, { strict: false })) return null;
  try {
    return getAddress(walletAddress);
  } catch {
    return walletAddress.toLowerCase() as Address;
  }
};

const readBalancesWithClient = async (
  client: ReturnType<typeof getPublicClient>,
  address: Address,
): Promise<OnChainBalances> => {
  const result: OnChainBalances = { sda: null, gat: null, usdx: null, fetchedAt: Date.now() };

  try {
    const wei = await client.getBalance({ address, blockTag: "latest" });
    result.sda = parseBalance(wei, 18);
  } catch {
    /* try next RPC */
  }

  if (isGatContractConfigured() && GAT_TOKEN.address) {
    try {
      const raw = await client.readContract({
        address: GAT_TOKEN.address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
        blockTag: "latest",
      });
      result.gat = parseBalance(raw, GAT_TOKEN.decimals);
    } catch {
      /* GAT contract not reachable on this RPC */
    }
  }

  if (USDX_TOKEN_ADDRESS) {
    try {
      const raw = await client.readContract({
        address: USDX_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
        blockTag: "latest",
      });
      result.usdx = parseBalance(raw, USDX_DECIMALS);
    } catch {
      /* USDX optional */
    }
  }

  return result;
};

const readBalancesOnce = async (address: Address): Promise<OnChainBalances> => {
  const merged: OnChainBalances = { sda: null, gat: null, usdx: null, fetchedAt: Date.now() };

  for (const rpcUrl of SIDRA_RPC_FALLBACKS) {
    try {
      const client = rpcUrl === SIDRA_RPC_FALLBACKS[0]
        ? getPublicClient()
        : createSidraPublicClient(rpcUrl);
      const read = await readBalancesWithClient(client, address);
      if (read.sda !== null) merged.sda = read.sda;
      if (read.gat !== null) merged.gat = read.gat;
      if (read.usdx !== null) merged.usdx = read.usdx;
      merged.fetchedAt = read.fetchedAt;
      if (merged.sda !== null && merged.gat !== null && (merged.usdx !== null || !USDX_TOKEN_ADDRESS)) {
        break;
      }
    } catch {
      /* next RPC */
    }
  }

  return merged;
};

/** Fetch native SDA + GAT (+ USDX) with RPC fallback for stable balance display. */
export const fetchWalletBalances = async (walletAddress: string): Promise<OnChainBalances> => {
  const address = resolveQueryAddress(walletAddress);
  if (!address) return { sda: null, gat: null, usdx: null, fetchedAt: Date.now() };

  const primary = await readBalancesOnce(address);
  if (hasLiveBalances(primary)) return primary;

  const retry = await readBalancesOnce(address);
  return hasLiveBalances(retry) ? retry : primary;
};
