/** Base Network, optional TAHAP 1 secondary chain (enable in .env) */

export const BASE_CHAIN = {
  chainId: Number(import.meta.env.VITE_BASE_CHAIN_ID) || 8453,
  chainIdHex: `0x${(Number(import.meta.env.VITE_BASE_CHAIN_ID) || 8453).toString(16)}`,
  name: "Base",
  symbol: "ETH",
  rpcUrl: import.meta.env.VITE_BASE_RPC_URL || "https://mainnet.base.org",
  blockExplorer: "https://basescan.org",
} as const;

export const isBaseNetwork = (chainId: number | string): boolean => {
  const id = typeof chainId === "string" ? parseInt(chainId, 16) : chainId;
  return id === BASE_CHAIN.chainId;
};
