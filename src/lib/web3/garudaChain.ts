/** Garuda Chain, official mainnet + internal testnet (Garuda Prime ecosystem) */

import { DEFAULT_APP_ORIGIN } from "../app/domains";

export type GarudaChainStatus = "prep" | "testnet" | "mainnet";

/** Official Garuda Chain mainnet, docs.garudachain.id */
export const GARUDA_CHAIN_MAINNET = {
  chainId: 8846,
  chainIdHex: "0x228e",
  name: "Garuda Chain Mainnet",
  symbol: "GDC",
  nativeName: "Garuda Digital Coin",
  rpcUrl: "https://rpc.garudachain.id",
  blockExplorer: "https://explorer.garudachain.id",
  docsUrl: "https://docs.garudachain.id",
  consensus: "IBFT 2.0",
  blockTime: "~2s",
  finality: "< 5s",
  validatorGenesis: 5,
  validatorTarget: 21,
  maxSupply: "1B GDC",
} as const;

/** Official Garuda Chain public testnet, docs.garudachain.id */
export const GARUDA_CHAIN_PUBLIC_TESTNET = {
  chainId: 8847,
  chainIdHex: "0x228f",
  name: "Garuda Chain Testnet",
  symbol: "GDC",
  nativeName: "Garuda Digital Coin",
  rpcUrl: "https://rpc.testnet.garudachain.id",
  blockExplorer: "",
  docsUrl: "https://docs.garudachain.id",
  consensus: "IBFT 2.0",
  blockTime: "~2s",
  finality: "< 5s",
  validatorGenesis: 5,
  validatorTarget: 21,
  maxSupply: "1B GDC",
} as const;

/** Internal Garuda Prime dev chain (legacy local Hardhat) */
export const GARUDA_CHAIN_DEVNET = {
  chainId: 974540,
  chainIdHex: "0xed9ac",
  name: "Garuda Chain Devnet",
  symbol: "GAT",
  nativeName: "Garuda Asset Token",
  rpcUrl: `${DEFAULT_APP_ORIGIN}/api/garuda/rpc`,
  blockExplorer: "",
  docsUrl: "https://docs.garudachain.id",
  consensus: "IBFT 2.0",
  blockTime: "~2s",
  finality: "< 5s",
  validatorGenesis: 5,
  validatorTarget: 21,
  maxSupply: "100M GAT",
} as const;

/** @deprecated use GARUDA_CHAIN_PUBLIC_TESTNET or GARUDA_CHAIN_DEVNET */
export const GARUDA_CHAIN_TESTNET = GARUDA_CHAIN_DEVNET;

const statusFromEnv = (): GarudaChainStatus => {
  const raw = import.meta.env.VITE_GARUDA_CHAIN_STATUS?.trim();
  if (raw === "testnet" || raw === "mainnet" || raw === "prep") return raw;
  return "mainnet";
};

const chainStatus = statusFromEnv();
const isMainnet = chainStatus === "mainnet";
const official = isMainnet
  ? GARUDA_CHAIN_MAINNET
  : (Number(import.meta.env.VITE_GARUDA_CHAIN_ID) === GARUDA_CHAIN_DEVNET.chainId
    ? GARUDA_CHAIN_DEVNET
    : GARUDA_CHAIN_PUBLIC_TESTNET);

/** Mainnet chain ID is fixed per docs.garudachain.id, ignore stale env overrides. */
const envChainId = Number(import.meta.env.VITE_GARUDA_CHAIN_ID);
const chainId = isMainnet
  ? GARUDA_CHAIN_MAINNET.chainId
  : (Number.isFinite(envChainId) && envChainId > 0 ? envChainId : official.chainId);

const defaultRpc =
  import.meta.env.VITE_GARUDA_CHAIN_RPC_URL?.trim()
  || official.rpcUrl;

/** Native gas token on Garuda Chain, GDC on mainnet, GAT on testnet */
export const GARUDA_NATIVE_CURRENCY = {
  name: isMainnet ? GARUDA_CHAIN_MAINNET.nativeName : official.nativeName,
  symbol: isMainnet ? GARUDA_CHAIN_MAINNET.symbol : official.symbol,
  decimals: 18,
} as const;

export const GARUDA_CHAIN = {
  chainId,
  chainIdHex: `0x${chainId.toString(16)}`,
  name: import.meta.env.VITE_GARUDA_CHAIN_NAME?.trim() || official.name,
  symbol: GARUDA_NATIVE_CURRENCY.symbol,
  nativeName: GARUDA_NATIVE_CURRENCY.name,
  rpcUrl: defaultRpc,
  blockExplorer:
    import.meta.env.VITE_GARUDA_CHAIN_EXPLORER?.trim()
    || official.blockExplorer,
  docsUrl: official.docsUrl,
  consensus: official.consensus,
  blockTime: official.blockTime,
  finality: official.finality,
  validatorGenesis: official.validatorGenesis,
  validatorTarget: official.validatorTarget,
  maxSupply: official.maxSupply,
  status: chainStatus,
  testnetGatAddress: import.meta.env.VITE_GARUDA_TESTNET_GAT_ADDRESS?.trim() || "",
  testnetBridgeVault: import.meta.env.VITE_GARUDA_TESTNET_BRIDGE_VAULT?.trim() || "",
  mainnetGatAddress: import.meta.env.VITE_GARUDA_MAINNET_GAT_ADDRESS?.trim() || "",
  mainnetBridgeVault: import.meta.env.VITE_GARUDA_MAINNET_BRIDGE_VAULT?.trim() || "",
} as const;

/** Active GAT token on Garuda Chain for current network status */
export const activeGarudaGatAddress = () =>
  isGarudaMainnet() ? GARUDA_CHAIN.mainnetGatAddress : GARUDA_CHAIN.testnetGatAddress;

/** Active bridge vault on Garuda Chain for current network status */
export const activeGarudaBridgeVault = () =>
  isGarudaMainnet() ? GARUDA_CHAIN.mainnetBridgeVault : GARUDA_CHAIN.testnetBridgeVault;

export const isGarudaChainLive = () => GARUDA_CHAIN.status === "testnet" || GARUDA_CHAIN.status === "mainnet";

export const isGarudaMainnet = () => GARUDA_CHAIN.status === "mainnet";

export const isGarudaChainNetwork = (chainId: number | string): boolean => {
  const id = typeof chainId === "string" ? parseInt(chainId, 16) : chainId;
  return id === GARUDA_CHAIN.chainId;
};
