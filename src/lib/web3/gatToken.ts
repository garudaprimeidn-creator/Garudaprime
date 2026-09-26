import { GARUDA_ECOSYSTEM } from "../ecosystem/garudaEcosystem";

const rawAddress = import.meta.env.VITE_GAT_TOKEN_ADDRESS?.trim();

export const GAT_TOKEN = {
  symbol: GARUDA_ECOSYSTEM.core.token.symbol,
  name: GARUDA_ECOSYSTEM.core.token.name,
  decimals: Number(import.meta.env.VITE_GAT_TOKEN_DECIMALS) || 18,
  /** Set VITE_GAT_TOKEN_ADDRESS when GAT is deployed on Sidra mainnet */
  address: rawAddress && /^0x[a-fA-F0-9]{40}$/.test(rawAddress)
    ? (rawAddress as `0x${string}`)
    : null,
} as const;

export const isGatContractConfigured = () => GAT_TOKEN.address !== null;
