import { GARUDA_CHAIN, isGarudaMainnet } from "./garudaChain";

export type GarudaChainStats = {
  chainId: number;
  blockNumber: number;
  online: boolean;
};

async function rpcPost(rpcUrl: string, method: string, params: unknown[] = []): Promise<unknown | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { result?: unknown };
    return data.result ?? null;
  } catch {
    return null;
  }
}

export const fetchGarudaChainStats = async (): Promise<GarudaChainStats | null> => {
  const rpcCandidates = isGarudaMainnet()
    ? [GARUDA_CHAIN.rpcUrl, `${import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "") || ""}/garuda/rpc`].filter(Boolean)
    : [GARUDA_CHAIN.rpcUrl];

  for (const rpcUrl of rpcCandidates) {
    const chainHex = await rpcPost(rpcUrl, "eth_chainId");
    if (typeof chainHex !== "string") continue;
    const chainId = parseInt(chainHex, 16);
    if (chainId !== GARUDA_CHAIN.chainId) continue;

    const blockHex = await rpcPost(rpcUrl, "eth_blockNumber");
    const blockNumber = typeof blockHex === "string" ? parseInt(blockHex, 16) : 0;
    return { chainId, blockNumber, online: true };
  }

  return { chainId: GARUDA_CHAIN.chainId, blockNumber: 0, online: false };
};

/** @deprecated use fetchGarudaChainStats */
export const fetchGarudaTestnetStats = fetchGarudaChainStats;
export type GarudaTestnetStats = GarudaChainStats;

export const fetchGarudaHealthApi = async (apiBase?: string) => {
  const base = apiBase?.replace(/\/$/, "") || import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");
  if (!base) return null;
  try {
    const res = await fetch(`${base}/garuda/health`);
    if (!res.ok) return null;
    return await res.json() as {
      ok: boolean;
      chainId: number;
      blockNumber: number | null;
    };
  } catch {
    return null;
  }
};
