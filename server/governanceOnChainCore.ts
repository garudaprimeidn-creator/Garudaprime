/**
 * Governance DAO on-chain relay (ADR-005 Phase 4).
 */
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import { getEmbeddedGatBalanceForUid } from "./chainBalanceService.js";
import {
  ensureGovernanceProposalOnChain,
  readGovernanceProposalOnChain,
  relayGovernanceCloseProposalOnChain,
  relayGovernanceCreateProposalOnChain,
  relayGovernanceVoteOnChain,
} from "./onChainProtocolAdapter.js";

const PROPOSALS_COL = "governance_proposals";

export async function relayUserGovernanceVote(input: {
  uid: string;
  proposalId: string;
  support: boolean;
}): Promise<{
  onChain: boolean;
  txHash?: string;
  weightGat: number;
  walletAddress: string;
}> {
  const { walletAddress, gatBalance } = await getEmbeddedGatBalanceForUid(input.uid);
  if (!walletAddress) {
    throw new Error("Garuda Wallet required for on-chain governance vote");
  }

  const weightGat = Math.max(1, Math.floor(gatBalance));
  await ensureGovernanceProposalOnChain({
    proposalId: input.proposalId,
    metadataRef: `firestore:${input.proposalId}`,
  });

  const relay = await relayGovernanceVoteOnChain({
    proposalId: input.proposalId,
    voterAddress: walletAddress,
    support: input.support,
    weightGat,
    uid: input.uid,
  });

  return {
    onChain: Boolean(relay?.txHash),
    txHash: relay?.txHash,
    weightGat,
    walletAddress,
  };
}

export async function relayUserGovernanceProposal(input: {
  proposalId: string;
  title: string;
  durationSec?: number;
}): Promise<{ onChain: boolean; txHash?: string }> {
  const metadataRef = JSON.stringify({
    source: "firestore",
    proposalId: input.proposalId,
    title: input.title.slice(0, 120),
  });

  const created = await relayGovernanceCreateProposalOnChain({
    proposalId: input.proposalId,
    metadataRef,
    durationSec: input.durationSec ?? 30 * 24 * 60 * 60,
  });

  return {
    onChain: Boolean(created?.txHash),
    txHash: created?.txHash ?? undefined,
  };
}

export async function relayGovernanceClose(input: {
  proposalId: string;
  requireVotingEnded?: boolean;
}): Promise<{ onChain: boolean; txHash?: string; passed?: boolean }> {
  await ensureGovernanceProposalOnChain({
    proposalId: input.proposalId,
    metadataRef: `firestore:${input.proposalId}`,
  });

  const relay = await relayGovernanceCloseProposalOnChain({
    proposalId: input.proposalId,
    requireVotingEnded: input.requireVotingEnded,
  });

  if (relay?.txHash) {
    const status = relay.passed ? "passed" : "rejected";
    await adminDb().collection(PROPOSALS_COL).doc(input.proposalId).set(
      {
        status,
        onChainClosedAt: FieldValue.serverTimestamp(),
        onChainCloseTxHash: relay.txHash,
      },
      { merge: true },
    );
  }

  return {
    onChain: Boolean(relay?.txHash),
    txHash: relay?.txHash,
    passed: relay?.passed,
  };
}

/** Close active proposals whose on-chain voting period has ended. */
export async function closeExpiredGovernanceProposals(): Promise<{
  scanned: number;
  closed: number;
  results: Array<{ proposalId: string; txHash?: string; passed?: boolean }>;
}> {
  const snap = await adminDb()
    .collection(PROPOSALS_COL)
    .where("status", "==", "active")
    .limit(30)
    .get()
    .catch(() => null);

  if (!snap?.size) {
    return { scanned: 0, closed: 0, results: [] };
  }

  const results: Array<{ proposalId: string; txHash?: string; passed?: boolean }> = [];
  let closed = 0;

  for (const doc of snap.docs) {
    const onChain = await readGovernanceProposalOnChain(doc.id);
    if (!onChain || onChain.endTime === 0n || onChain.closed) continue;

    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now < onChain.endTime) continue;

    const relay = await relayGovernanceClose({ proposalId: doc.id, requireVotingEnded: true });
    results.push({
      proposalId: doc.id,
      txHash: relay.txHash,
      passed: relay.passed,
    });
    if (relay.onChain) closed += 1;
  }

  return { scanned: snap.size, closed, results };
}

export function governanceOnChainErrorStatus(message: string): number {
  if (message === "Unauthorized" || message.includes("token")) return 401;
  if (message.includes("required") || message.includes("Invalid")) return 400;
  return 500;
}
