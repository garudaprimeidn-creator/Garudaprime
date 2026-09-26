import {
  createWalletClient,
  fallback,
  http,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { TrustEthereumProvider } from "./trustWalletProvider";
import { SIDRA_CHAIN } from "./sidraNetwork";
import { SIDRA_RPC_FALLBACKS } from "./publicClient";

const sidraChain = {
  id: SIDRA_CHAIN.chainId,
  name: SIDRA_CHAIN.name,
  nativeCurrency: { name: SIDRA_CHAIN.symbol, symbol: SIDRA_CHAIN.symbol, decimals: 18 },
  rpcUrls: { default: { http: SIDRA_RPC_FALLBACKS } },
} as const;

/** EIP-1193 provider, signs locally from BIP39-derived private key (no MetaMask popup). */
export function createLocalPhraseWalletProvider(
  address: string,
  privateKey: Hex,
): TrustEthereumProvider {
  const account = privateKeyToAccount(privateKey);
  const chainIdHex = `0x${SIDRA_CHAIN.chainId.toString(16)}`;
  const client = createWalletClient({
    account,
    chain: sidraChain,
    transport: fallback(
      SIDRA_RPC_FALLBACKS.map((url) => http(url, { timeout: 12_000 })),
      { rank: false },
    ),
  });

  return {
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
          const hash = await client.sendTransaction({
            account,
            chain: sidraChain,
            to: tx.to as `0x${string}`,
            value: tx.value ? BigInt(tx.value) : undefined,
            data: tx.data as Hex | undefined,
            gas: tx.gas ? BigInt(tx.gas) : undefined,
            gasPrice: tx.gasPrice ? BigInt(tx.gasPrice) : undefined,
            maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : undefined,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas
              ? BigInt(tx.maxPriorityFeePerGas)
              : undefined,
            nonce: tx.nonce ? Number(BigInt(tx.nonce)) : undefined,
          });
          return hash as Hash;
        }
        case "personal_sign":
        case "eth_sign": {
          const raw = params?.[0] ?? params?.[1];
          const message = typeof raw === "string" ? raw : String(raw ?? "");
          return account.signMessage({ message });
        }
        default:
          throw Object.assign(
            new Error(`Phrase wallet does not support ${method}`),
            { code: "phrase/unsupported-method" },
          );
      }
    },
    isMetaMask: false,
    isTrust: false,
  } as unknown as TrustEthereumProvider;
}
