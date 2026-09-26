import { createPublicClient, fallback, http, type PublicClient } from "viem";
import { SIDRA_CHAIN } from "./sidraNetwork";

const sidraChain = {
  id: SIDRA_CHAIN.chainId,
  name: SIDRA_CHAIN.name,
  nativeCurrency: { name: SIDRA_CHAIN.symbol, symbol: SIDRA_CHAIN.symbol, decimals: 18 },
  rpcUrls: { default: { http: [SIDRA_CHAIN.rpcUrl] } },
} as const;

export const SIDRA_RPC_FALLBACKS = Array.from(
  new Set(
    [
      SIDRA_CHAIN.rpcUrl,
      import.meta.env.VITE_SIDRA_RPC_FALLBACK?.trim(),
      "https://rpc.sidrachain.com",
    ].filter(Boolean) as string[],
  ),
);

let client: PublicClient | null = null;

export const getPublicClient = (): PublicClient => {
  if (!client) {
    client = createPublicClient({
      chain: sidraChain,
      transport: fallback(
        SIDRA_RPC_FALLBACKS.map((url) => http(url, { timeout: 12_000 })),
        { rank: false },
      ),
      batch: { multicall: true },
    });
  }
  return client;
};

/** Fresh client per RPC attempt, used when primary fallback transport fails. */
export const createSidraPublicClient = (rpcUrl: string): PublicClient =>
  createPublicClient({
    chain: sidraChain,
    transport: http(rpcUrl, { timeout: 12_000 }),
  });
