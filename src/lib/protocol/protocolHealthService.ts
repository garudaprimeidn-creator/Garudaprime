export type ProtocolPoolHealth = {
  address: string | null;
  balanceGat: number;
  reservedGat: number;
  headroomGat: number;
  paused: boolean;
  healthy: boolean;
};

export type ProtocolFundApr = {
  fundId: number;
  aprBps: number;
  configured: boolean;
};

export type ProtocolHealthReport = {
  ok: boolean;
  configured: boolean;
  chainId: number;
  contracts: {
    gatToken: string | null;
    investmentVault: string | null;
    stakingPool: string | null;
  };
  funds: ProtocolFundApr[];
  investmentVault: ProtocolPoolHealth;
  stakingPool: ProtocolPoolHealth;
  warnings: string[];
  readyForInvest: boolean;
  readyForStake: boolean;
};

function apiBase(): string | null {
  const base = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");
  return base || null;
}

export async function fetchProtocolHealth(): Promise<ProtocolHealthReport | null> {
  const base = apiBase();
  if (!base) return null;

  try {
    const res = await fetch(`${base}/protocol/health`, { method: "GET" });
    if (!res.ok) return null;
    return (await res.json()) as ProtocolHealthReport;
  } catch {
    return null;
  }
}
