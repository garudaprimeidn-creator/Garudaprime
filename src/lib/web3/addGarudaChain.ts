import { GARUDA_CHAIN, GARUDA_NATIVE_CURRENCY } from "./garudaChain";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export type AddGarudaChainResult = {
  /** Network is active in wallet */
  switched: boolean;
  /** Wallet already had this chain, symbol may still show legacy GGC until user removes & re-adds */
  symbolStaleHint: boolean;
};

const walletChainParams = () => [{
  chainId: GARUDA_CHAIN.chainIdHex,
  chainName: GARUDA_CHAIN.name,
  nativeCurrency: {
    name: GARUDA_NATIVE_CURRENCY.name,
    symbol: GARUDA_NATIVE_CURRENCY.symbol,
    decimals: GARUDA_NATIVE_CURRENCY.decimals,
  },
  rpcUrls: [GARUDA_CHAIN.rpcUrl],
  blockExplorerUrls: GARUDA_CHAIN.blockExplorer ? [GARUDA_CHAIN.blockExplorer] : [],
}];

const isChainAlreadyAddedError = (e: unknown): boolean => {
  const code = (e as { code?: number })?.code;
  if (code === -32603 || code === 4001) return false;
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes("already")
    || msg.includes("exists")
    || msg.includes("duplicate")
    || msg.includes("same chain")
  );
};

/** Register Garuda Chain in wallet with native currency (GDC mainnet / GAT testnet) */
export const addGarudaChainToWallet = async (
  provider?: EthereumProvider,
): Promise<AddGarudaChainResult> => {
  const eth = provider ?? window.ethereum;
  if (!eth) throw new Error("No wallet provider");

  let symbolStaleHint = false;

  try {
    await eth.request({ method: "wallet_addEthereumChain", params: walletChainParams() });
  } catch (e) {
    if (!isChainAlreadyAddedError(e)) throw e;
    symbolStaleHint = true;
  }

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: GARUDA_CHAIN.chainIdHex }],
    });
  } catch (e) {
    const code = (e as { code?: number })?.code;
    if (code === 4902) {
      await eth.request({ method: "wallet_addEthereumChain", params: walletChainParams() });
      symbolStaleHint = false;
    } else {
      throw e;
    }
  }

  return { switched: true, symbolStaleHint };
};

export const switchToGarudaChain = async (provider?: EthereumProvider) => {
  const eth = provider ?? window.ethereum;
  if (!eth) throw new Error("No wallet provider");
  await eth.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: GARUDA_CHAIN.chainIdHex }],
  });
};
