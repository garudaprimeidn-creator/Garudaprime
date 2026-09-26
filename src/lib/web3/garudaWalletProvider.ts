import type { TrustEthereumProvider } from "./trustWalletProvider";
import { SIDRA_CHAIN } from "./sidraNetwork";
import { signGarudaWalletRequest } from "./garudaWalletApi";

export type GarudaSignRequestFn = (
  input: {
    address: string;
    method: string;
    transaction?: Record<string, string>;
    message?: string;
  },
) => Promise<{ txHash?: string; signature?: string }>;

/** EIP-1193 provider backed by Garuda Wallet Service (server signing). */
export function createGarudaWalletProvider(
  address: string,
  signRequest: GarudaSignRequestFn,
): TrustEthereumProvider {
  const chainIdHex = `0x${SIDRA_CHAIN.chainId.toString(16)}`;

  const provider = {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      switch (method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return [address];
        case "eth_chainId":
          return chainIdHex;
        case "net_version":
          return String(SIDRA_CHAIN.chainId);
        case "eth_sendTransaction": {
          const tx = (params?.[0] ?? {}) as Record<string, string>;
          const { txHash } = await signRequest({
            address,
            method: "eth_sendTransaction",
            transaction: { ...tx, from: address },
          });
          if (!txHash) throw new Error("No transaction hash returned");
          return txHash;
        }
        case "personal_sign":
        case "eth_sign": {
          const message = String(params?.[0] ?? params?.[1] ?? "");
          const { signature } = await signRequest({
            address,
            method: "personal_sign",
            message,
          });
          if (!signature) throw new Error("No signature returned");
          return signature;
        }
        default:
          throw Object.assign(
            new Error(`Garuda wallet provider does not support ${method}`),
            { code: "garuda/unsupported-method" },
          );
      }
    },
    isMetaMask: false,
    isTrust: false,
  } as unknown as TrustEthereumProvider;

  return provider;
}
