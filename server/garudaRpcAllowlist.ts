const ALLOWED_RPC_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getBalance",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_getLogs",
  "net_version",
  "net_listening",
]);

export const assertAllowedRpcMethod = (body: string): void => {
  let parsed: { method?: string };
  try {
    parsed = JSON.parse(body) as { method?: string };
  } catch {
    throw new Error("Invalid JSON-RPC body");
  }

  const method = String(parsed.method ?? "").trim();
  if (!method || !ALLOWED_RPC_METHODS.has(method)) {
    throw new Error("RPC method not allowed");
  }
};
