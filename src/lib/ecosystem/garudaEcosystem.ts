/**
 * Garuda Prime, Ecosystem & blockchain roadmap
 *
 * TAHAP 1: GAT + Pay Hub + AI + Wallet on SDA Sidra (primary) or Base (optional)
 * TAHAP 2: Sidechain, L2, validator → Garuda Chain testnet
 * TAHAP 3: Decentralized governance DAO
 * TAHAP 4: Garuda Chain mainnet + full infra migration
 */

export type EcosystemPhase = 1 | 2 | 3 | 4;

export type NetworkId = "sidra" | "base" | "garuda-chain";

const envPhase = Number(import.meta.env.VITE_ECOSYSTEM_PHASE);
const currentPhase: EcosystemPhase =
  envPhase === 4 ? 4 : envPhase === 3 ? 3 : envPhase === 2 ? 2 : envPhase === 1 ? 1 : 4;

export const GARUDA_ECOSYSTEM = {
  phase: currentPhase satisfies EcosystemPhase,

  core: {
    payHub: "Garuda Pay Hub",
    wallet: "Garuda Prime Wallet",
    ai: "Garuda AI Ecosystem",
    token: {
      symbol: "GAT",
      name: "Garuda Asset Token",
      description: "Utility & payment token across Garuda Prime",
      totalSupply: 100_000_000,
      maxSupply: 100_000_000,
    },
  },

  networks: {
    primary: "sidra" as const satisfies NetworkId,
    secondary: "base" as const satisfies NetworkId,
    future: "garuda-chain" as const satisfies NetworkId,
  },

  future: {
    sidechain: currentPhase >= 2,
    customL2: currentPhase >= 2,
    validators: currentPhase >= 2,
    garudaChainTestnet: currentPhase >= 2,
    decentralizedGovernance: currentPhase >= 3,
    fullInfraMigration: currentPhase >= 4,
    garudaChainMainnet: currentPhase >= 4,
  },
} as const;

export const isPhase2Active = () => GARUDA_ECOSYSTEM.phase >= 2;
export const isPhase3Active = () => GARUDA_ECOSYSTEM.phase >= 3;
export const isPhase4Active = () => GARUDA_ECOSYSTEM.phase >= 4;
export const isGovernanceEnabled = () =>
  import.meta.env.VITE_GOVERNANCE_ENABLED?.trim().toLowerCase() === "true";
export const isMainnetMigrationEnabled = () => GARUDA_ECOSYSTEM.future.fullInfraMigration;

/** Admin cut-off: set VITE_MAINNET_MIGRATION_OPEN=false to hide migration UI globally */
export const isMainnetMigrationOpen = () => {
  if (!isMainnetMigrationEnabled()) return false;
  const flag = import.meta.env.VITE_MAINNET_MIGRATION_OPEN?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "closed") return false;
  return true;
};

export const isPhaseAtLeast = (min: EcosystemPhase) => GARUDA_ECOSYSTEM.phase >= min;

export const activePrimaryNetwork = (): NetworkId => GARUDA_ECOSYSTEM.networks.primary;

export const isBaseEnabled = () =>
  import.meta.env.VITE_ENABLE_BASE_NETWORK === "true";

export const isGarudaChainEnabled = () =>
  GARUDA_ECOSYSTEM.future.garudaChainTestnet && isPhaseAtLeast(2);
