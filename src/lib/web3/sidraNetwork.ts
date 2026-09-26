export const SIDRA_CHAIN = {
  chainId: Number(import.meta.env.VITE_SIDRA_CHAIN_ID) || 97453,
  chainIdHex: `0x${(Number(import.meta.env.VITE_SIDRA_CHAIN_ID) || 97453).toString(16)}`,
  name: "SIDRA Network",
  symbol: "SDA",
  rpcUrl: import.meta.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com",
  blockExplorer: "https://ledger.sidrachain.com",
} as const;

export const isSidraNetwork = (chainId: number | string): boolean => {
  const id = typeof chainId === "string" ? parseInt(chainId, 16) : chainId;
  return id === SIDRA_CHAIN.chainId;
};
