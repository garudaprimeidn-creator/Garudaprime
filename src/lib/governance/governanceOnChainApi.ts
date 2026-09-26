import { getPayHubAuthToken, isPayHubApiConfigured } from "../payhub/payHubApi";

const apiBase = () => import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "") ?? "";

async function governanceFetch(path: string, body: Record<string, unknown>) {
  if (!isPayHubApiConfigured()) return null;
  const base = apiBase();
  if (!base) return null;

  const token = await getPayHubAuthToken();
  if (!token) return null;

  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error ?? "Governance on-chain relay failed"), {
      code: "governance/on-chain-failed",
    });
  }
  return data as {
    ok?: boolean;
    onChain?: boolean;
    txHash?: string;
    weightGat?: number;
  };
}

/** Mirror governance vote to GarudaGovernanceCouncil (no-op when not configured). */
export async function relayGovernanceVoteOnChain(input: {
  proposalId: string;
  support: boolean;
}): Promise<{ onChain: boolean; txHash?: string; weightGat?: number } | null> {
  try {
    const data = await governanceFetch("/protocol/governance/vote", {
      proposalId: input.proposalId,
      support: input.support,
    });
    if (!data) return null;
    return {
      onChain: Boolean(data.onChain),
      txHash: data.txHash,
      weightGat: data.weightGat,
    };
  } catch {
    return null;
  }
}

/** Register new Firestore proposal on GarudaGovernanceCouncil. */
export async function relayGovernanceProposalOnChain(input: {
  proposalId: string;
  title: string;
}): Promise<{ onChain: boolean; txHash?: string } | null> {
  try {
    const data = await governanceFetch("/protocol/governance/proposal", {
      proposalId: input.proposalId,
      title: input.title,
    });
    if (!data) return null;
    return { onChain: Boolean(data.onChain), txHash: data.txHash };
  } catch {
    return null;
  }
}
