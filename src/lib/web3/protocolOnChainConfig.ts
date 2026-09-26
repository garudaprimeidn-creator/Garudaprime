import { isGatContractConfigured } from "./gatToken";
import { PROTOCOL_CONTRACTS, isProtocolConfigured } from "./protocolContracts";

function readEnvFlag(key: string): boolean | null {
  const raw = import.meta.env[key]?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  return null;
}

/** Invest GAT langsung ke GATInvestmentVault (bukan API ledger). */
export function isOnChainInvestEnabled(): boolean {
  const flag = readEnvFlag("VITE_PROTOCOL_ONCHAIN_INVEST");
  if (flag !== null) return flag;
  return isGatContractConfigured()
    && isProtocolConfigured()
    && Boolean(PROTOCOL_CONTRACTS.investmentVault);
}

/** Stake GAT langsung ke GATStakingPool (bukan API ledger). */
export function isOnChainStakeEnabled(): boolean {
  const flag = readEnvFlag("VITE_PROTOCOL_ONCHAIN_STAKE");
  if (flag !== null) return flag;
  return isGatContractConfigured()
    && isProtocolConfigured()
    && Boolean(PROTOCOL_CONTRACTS.stakingPool);
}
