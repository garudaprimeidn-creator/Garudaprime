/** Sidra Chain Blockscout API, https://ledger.sidrachain.com/api-docs */

const EXPLORER_API =
  import.meta.env.VITE_SIDRA_EXPLORER_API?.replace(/\/$/, "")
  || "https://ledger.sidrachain.com/api/v2";

export type SidraChainStats = {
  totalBlocks: string;
  totalTransactions: string;
  totalAddresses: string;
  gasPriceGwei: number;
  transactionsToday: string;
};

export type SidraTokenInfo = {
  name: string;
  symbol: string;
  totalSupply: string;
  holders: string;
  decimals: number;
  address: string;
};

export const fetchSidraStats = async (): Promise<SidraChainStats | null> => {
  try {
    const res = await fetch(`${EXPLORER_API}/stats`);
    if (!res.ok) return null;
    const data = await res.json() as {
      total_blocks?: string;
      total_transactions?: string;
      total_addresses?: string;
      gas_prices?: { average?: number };
      transactions_today?: string;
    };
    return {
      totalBlocks: data.total_blocks ?? ", ",
      totalTransactions: data.total_transactions ?? ", ",
      totalAddresses: data.total_addresses ?? ", ",
      gasPriceGwei: data.gas_prices?.average ?? 0,
      transactionsToday: data.transactions_today ?? ", ",
    };
  } catch {
    return null;
  }
};

export const fetchSidraToken = async (address: string): Promise<SidraTokenInfo | null> => {
  try {
    const res = await fetch(`${EXPLORER_API}/tokens/${address}`);
    if (!res.ok) return null;
    const data = await res.json() as {
      name?: string;
      symbol?: string;
      total_supply?: string;
      holders_count?: string;
      decimals?: string;
      address_hash?: string;
    };
    const decimals = Number(data.decimals ?? 18);
    const raw = BigInt(data.total_supply ?? "0");
    const supply = Number(raw) / 10 ** decimals;
    return {
      name: data.name ?? "Token",
      symbol: data.symbol ?? ", ",
      totalSupply: supply.toLocaleString("en-US", { maximumFractionDigits: 0 }),
      holders: data.holders_count ?? "0",
      decimals,
      address: data.address_hash ?? address,
    };
  } catch {
    return null;
  }
};

const EXPLORER_WEB =
  import.meta.env.VITE_SIDRA_EXPLORER_URL?.replace(/\/$/, "")
  || "https://ledger.sidrachain.com";

export const sidraExplorerUrl = (path: string) =>
  `${EXPLORER_WEB}${path.startsWith("/") ? path : `/${path}`}`;

export const sidraExplorerTxUrl = (txHash: string) => {
  const hash = txHash.trim();
  if (!hash.startsWith("0x")) return sidraExplorerUrl("/txs");
  return sidraExplorerUrl(`/tx/${hash}`);
};

export const sidraExplorerAddressUrl = (address: string) => {
  const addr = address.trim();
  if (!addr.startsWith("0x")) return sidraExplorerUrl("/accounts");
  return sidraExplorerUrl(`/address/${addr}`);
};
