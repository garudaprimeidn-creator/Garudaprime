import { SIDRA_CHAIN, isSidraNetwork } from "./sidraNetwork";

export type EthereumRequestProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

/** Switch wallet to Sidra Network, adding the chain if the wallet does not have it yet. */
export const ensureSidraNetwork = async (eth: EthereumRequestProvider): Promise<number> => {
  const chainIdHex = (await eth.request({ method: "eth_chainId" })) as string;
  const chainId = parseInt(chainIdHex, 16);
  if (isSidraNetwork(chainId)) return chainId;

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SIDRA_CHAIN.chainIdHex }],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : "";
    if (msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel")) {
      throw Object.assign(e instanceof Error ? e : new Error("User rejected network switch"), {
        code: "wallet/user-rejected",
      });
    }
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: SIDRA_CHAIN.chainIdHex,
        chainName: SIDRA_CHAIN.name,
        nativeCurrency: { name: SIDRA_CHAIN.symbol, symbol: SIDRA_CHAIN.symbol, decimals: 18 },
        rpcUrls: [SIDRA_CHAIN.rpcUrl],
        blockExplorerUrls: [SIDRA_CHAIN.blockExplorer],
      }],
    });
  }
  return SIDRA_CHAIN.chainId;
};
