/** Garuda Chain JSON-RPC proxy backend (mainnet preferred, Sidra fallback on Vercel) */

function trimUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function sidraFallbackRpc(): string {
  return trimUrl(
    process.env.VITE_SIDRA_RPC_URL?.trim()
    || process.env.SIDRA_RPC_URL?.trim()
    || "https://rpc.sidrachain.com",
  );
}

function isUnreachableOnServerless(url: string): boolean {
  return /localhost|127\.0\.0\.1|ngrok/i.test(url);
}

export function resolveGarudaRpcBackends(): string[] {
  const ordered: string[] = [];
  const push = (raw?: string) => {
    const url = raw?.trim();
    if (!url) return;
    const normalized = trimUrl(url);
    if (!ordered.includes(normalized)) ordered.push(normalized);
  };

  push(process.env.GARUDA_MAINNET_RPC_BACKEND);
  push(process.env.GARUDA_TESTNET_RPC_BACKEND);
  push("https://rpc.garudachain.id");

  const usable = ordered.filter((u) => !isUnreachableOnServerless(u));
  const fallback = sidraFallbackRpc();
  if (!usable.includes(fallback)) usable.push(fallback);
  return usable.length ? usable : [fallback];
}

export const GARUDA_RPC_BACKEND = resolveGarudaRpcBackends()[0] ?? sidraFallbackRpc();

async function rpcCall(backend: string, body: string): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(backend, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(12_000),
  });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

export const proxyGarudaRpc = async (body: string) => {
  const backends = resolveGarudaRpcBackends();
  let last = { status: 502, text: '{"error":"RPC unavailable"}' };

  for (const backend of backends) {
    try {
      const result = await rpcCall(backend, body);
      if (result.ok) {
        return { status: result.status, text: result.text, backend };
      }
      last = { status: result.status, text: result.text };
    } catch {
      /* try next backend */
    }
  }

  return { status: last.status, text: last.text, backend: backends[0] };
};

export const fetchGarudaRpcHealth = async () => {
  const backends = resolveGarudaRpcBackends();
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] });

  for (const backend of backends) {
    try {
      const res = await rpcCall(backend, body);
      if (!res.ok) continue;
      const data = JSON.parse(res.text) as { result?: string };
      const chainId = data.result ? parseInt(data.result, 16) : 0;
      if (!chainId) continue;

      const blockRes = await rpcCall(
        backend,
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] }),
      );
      const blockData = JSON.parse(blockRes.text) as { result?: string };
      const blockNumber = blockData.result ? parseInt(blockData.result, 16) : 0;

      return {
        ok: true as const,
        chainId,
        blockNumber,
        backend,
        fallback: backend === sidraFallbackRpc() || isUnreachableOnServerless(backends[0] ?? ""),
      };
    } catch {
      /* try next */
    }
  }

  return { ok: false as const, backend: backends[0] ?? sidraFallbackRpc(), fallback: true };
};
