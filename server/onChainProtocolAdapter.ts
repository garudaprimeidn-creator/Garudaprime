/**
 * Validator + Governance on-chain relay (ADR-005 Phase 4).
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import {
  isPayHubOnChainConfigured,
  loadPayHubOnChainContracts,
  shouldShadowWriteOnChain,
} from "./payHubLedgerMode.js";

const JOBS_COL = "pay_relayer_jobs";
const sidraRpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
const sidraChainId = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;

const VALIDATOR_ABI = [
  {
    type: "function",
    name: "relayStake",
    stateMutability: "payable",
    inputs: [
      { name: "appId", type: "bytes32" },
      { name: "validator", type: "address" },
      { name: "amountSda", type: "uint256" },
      { name: "refId", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "relayActivate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "appId", type: "bytes32" },
      { name: "validator", type: "address" },
    ],
    outputs: [],
  },
] as const;

const GOVERNANCE_ABI = [
  {
    type: "function",
    name: "relayCreateProposal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proposalId", type: "bytes32" },
      { name: "durationSec", type: "uint64" },
      { name: "metadataRef", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "relayVote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proposalId", type: "bytes32" },
      { name: "voter", type: "address" },
      { name: "support", type: "bool" },
      { name: "weight", type: "uint256" },
      { name: "refId", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "relayCloseProposal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proposalId", type: "bytes32" },
      { name: "totalEligibleWeight", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "proposals",
    stateMutability: "view",
    inputs: [{ name: "proposalId", type: "bytes32" }],
    outputs: [
      { name: "yesWeight", type: "uint256" },
      { name: "noWeight", type: "uint256" },
      { name: "endTime", type: "uint64" },
      { name: "closed", type: "bool" },
      { name: "metadataRef", type: "string" },
    ],
  },
] as const;

const GAT_SUPPLY_ABI = [
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

function relayerKey(): Hex | null {
  const key =
    process.env.PAY_HUB_RELAYER_PRIVATE_KEY?.trim()
    || process.env.PROTOCOL_OWNER_PRIVATE_KEY?.trim()
    || process.env.DEPLOYER_PRIVATE_KEY?.trim();
  return key?.startsWith("0x") ? (key as Hex) : null;
}

const sidraChain = {
  id: sidraChainId,
  name: "Sidra",
  nativeCurrency: { name: "SDA", symbol: "SDA", decimals: 18 },
  rpcUrls: { default: { http: [sidraRpc] } },
} as const;

function publicClient() {
  return createPublicClient({ chain: sidraChain, transport: http(sidraRpc) });
}

function walletClient() {
  const key = relayerKey();
  if (!key) throw new Error("Relayer private key not configured");
  const account = privateKeyToAccount(key);
  return createWalletClient({
    account,
    chain: sidraChain,
    transport: http(sidraRpc),
  });
}

function refToBytes32(refId: string): Hex {
  return keccak256(stringToBytes(refId));
}

function toSdaWei(amount: number): bigint {
  const whole = Math.floor(amount);
  const frac = Math.round((amount - whole) * 1e6);
  return BigInt(whole) * 10n ** 18n + BigInt(frac) * 10n ** 12n;
}

async function queueJob(doc: Record<string, unknown>) {
  await adminDb().collection(JOBS_COL).add({
    ...doc,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function relayValidatorActivateOnChain(input: {
  applicationId: string;
  validatorAddress: string;
  stakeSda?: number;
}): Promise<{ txHash: string } | null> {
  if (!shouldShadowWriteOnChain() || !isPayHubOnChainConfigured()) return null;
  const contracts = loadPayHubOnChainContracts()!;
  const validatorAddr = contracts.validator?.trim();
  if (!validatorAddr?.startsWith("0x")) return null;

  const appId = refToBytes32(`validator-app:${input.applicationId}`);
  const refId = refToBytes32(`validator-activate:${input.applicationId}`);
  const stakeWei = input.stakeSda && input.stakeSda > 0 ? toSdaWei(input.stakeSda) : 0n;
  const client = walletClient();

  if (stakeWei > 0n) {
    const stakeHash = await client.writeContract({
      address: validatorAddr as Address,
      abi: VALIDATOR_ABI,
      functionName: "relayStake",
      args: [appId, input.validatorAddress as Address, stakeWei, refId],
      value: stakeWei,
    });
    await queueJob({
      type: "validator_stake",
      applicationId: input.applicationId,
      validator: input.validatorAddress.toLowerCase(),
      txHash: stakeHash,
      refId: `validator-activate:${input.applicationId}`,
    });
  }

  const hash = await client.writeContract({
    address: validatorAddr as Address,
    abi: VALIDATOR_ABI,
    functionName: "relayActivate",
    args: [appId, input.validatorAddress as Address],
  });

  await queueJob({
    type: "validator_activate",
    applicationId: input.applicationId,
    validator: input.validatorAddress.toLowerCase(),
    txHash: hash,
    refId: `validator-activate:${input.applicationId}`,
  });

  return { txHash: hash };
}

export async function relayGovernanceCreateProposalOnChain(input: {
  proposalId: string;
  metadataRef: string;
  durationSec?: number;
}): Promise<{ txHash: string } | null> {
  if (!shouldShadowWriteOnChain() || !isPayHubOnChainConfigured()) return null;
  const contracts = loadPayHubOnChainContracts()!;
  const governanceAddr = contracts.governance?.trim();
  if (!governanceAddr?.startsWith("0x")) return null;

  const proposalKey = refToBytes32(`governance:${input.proposalId}`);
  const duration = BigInt(input.durationSec ?? 30 * 24 * 60 * 60);
  const client = walletClient();
  const hash = await client.writeContract({
    address: governanceAddr as Address,
    abi: GOVERNANCE_ABI,
    functionName: "relayCreateProposal",
    args: [proposalKey, duration, input.metadataRef],
  });

  await queueJob({
    type: "governance_proposal",
    proposalId: input.proposalId,
    metadataRef: input.metadataRef,
    txHash: hash,
    refId: `governance-proposal:${input.proposalId}`,
  });

  return { txHash: hash };
}

/** Idempotent, skips if proposal already exists on-chain. */
export async function ensureGovernanceProposalOnChain(input: {
  proposalId: string;
  metadataRef?: string;
  durationSec?: number;
}): Promise<{ txHash?: string; created: boolean }> {
  try {
    const relay = await relayGovernanceCreateProposalOnChain({
      proposalId: input.proposalId,
      metadataRef: input.metadataRef ?? `firestore:${input.proposalId}`,
      durationSec: input.durationSec,
    });
    return { txHash: relay?.txHash, created: Boolean(relay?.txHash) };
  } catch {
    return { created: false };
  }
}

export async function relayGovernanceVoteOnChain(input: {
  proposalId: string;
  voterAddress: string;
  support: boolean;
  weightGat: number;
  uid: string;
}): Promise<{ txHash: string } | null> {
  if (!shouldShadowWriteOnChain() || !isPayHubOnChainConfigured()) return null;
  const contracts = loadPayHubOnChainContracts()!;
  const governanceAddr = contracts.governance?.trim();
  if (!governanceAddr?.startsWith("0x")) return null;

  const proposalKey = refToBytes32(`governance:${input.proposalId}`);
  const voteRef = refToBytes32(`gov-vote:${input.proposalId}:${input.uid}`);
  const weight = BigInt(Math.max(0, Math.floor(input.weightGat))) * 10n ** 18n;

  const client = walletClient();
  const hash = await client.writeContract({
    address: governanceAddr as Address,
    abi: GOVERNANCE_ABI,
    functionName: "relayVote",
    args: [
      proposalKey,
      input.voterAddress as Address,
      input.support,
      weight,
      voteRef,
    ],
  });

  await queueJob({
    type: "governance_vote",
    proposalId: input.proposalId,
    uid: input.uid,
    voter: input.voterAddress.toLowerCase(),
    support: input.support,
    weightGat: input.weightGat,
    txHash: hash,
    refId: `gov-vote:${input.proposalId}:${input.uid}`,
  });

  return { txHash: hash };
}

/** Total GAT supply (wei) for on-chain quorum denominator. */
export async function getGatTotalSupplyWei(): Promise<bigint> {
  const contracts = loadPayHubOnChainContracts();
  const gatAddr = contracts?.gatToken?.trim();
  if (gatAddr?.startsWith("0x")) {
    try {
      const supply = await publicClient().readContract({
        address: gatAddr as Address,
        abi: GAT_SUPPLY_ABI,
        functionName: "totalSupply",
      });
      if (supply > 0n) return supply;
    } catch {
      /* fallback below */
    }
  }
  const fallbackGat = Number(process.env.GOVERNANCE_TOTAL_ELIGIBLE_GAT ?? 1_000_000);
  return BigInt(Math.max(1, Math.floor(fallbackGat))) * 10n ** 18n;
}

export async function readGovernanceProposalOnChain(proposalId: string): Promise<{
  yesWeight: bigint;
  noWeight: bigint;
  endTime: bigint;
  closed: boolean;
} | null> {
  if (!isPayHubOnChainConfigured()) return null;
  const contracts = loadPayHubOnChainContracts()!;
  const governanceAddr = contracts.governance?.trim();
  if (!governanceAddr?.startsWith("0x")) return null;

  const proposalKey = refToBytes32(`governance:${proposalId}`);
  try {
    const row = await publicClient().readContract({
      address: governanceAddr as Address,
      abi: GOVERNANCE_ABI,
      functionName: "proposals",
      args: [proposalKey],
    });
    return {
      yesWeight: row[0],
      noWeight: row[1],
      endTime: row[2],
      closed: row[3],
    };
  } catch {
    return null;
  }
}

export async function relayGovernanceCloseProposalOnChain(input: {
  proposalId: string;
  totalEligibleWeight?: bigint;
  requireVotingEnded?: boolean;
}): Promise<{ txHash: string; passed?: boolean } | null> {
  if (!shouldShadowWriteOnChain() || !isPayHubOnChainConfigured()) return null;
  const contracts = loadPayHubOnChainContracts()!;
  const governanceAddr = contracts.governance?.trim();
  if (!governanceAddr?.startsWith("0x")) return null;

  const onChain = await readGovernanceProposalOnChain(input.proposalId);
  if (!onChain || onChain.endTime === 0n) return null;
  if (onChain.closed) return null;

  if (input.requireVotingEnded !== false) {
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now < onChain.endTime) return null;
  }

  const proposalKey = refToBytes32(`governance:${input.proposalId}`);
  const totalEligible = input.totalEligibleWeight ?? await getGatTotalSupplyWei();
  const client = walletClient();
  const hash = await client.writeContract({
    address: governanceAddr as Address,
    abi: GOVERNANCE_ABI,
    functionName: "relayCloseProposal",
    args: [proposalKey, totalEligible],
  });

  const turnout = onChain.yesWeight + onChain.noWeight;
  const quorumWeight = (totalEligible * 500n) / 10_000n;
  const passed = turnout >= quorumWeight && onChain.yesWeight > onChain.noWeight;

  await queueJob({
    type: "governance_close",
    proposalId: input.proposalId,
    passed,
    txHash: hash,
    refId: `governance-close:${input.proposalId}`,
  });

  return { txHash: hash, passed };
}
