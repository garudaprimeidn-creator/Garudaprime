#!/usr/bin/env node
/**
 * Verify GarudaGovernanceCouncil on-chain vs Firestore proposals.
 * Usage:
 *   node scripts/verify-governance-onchain.mjs
 *   node scripts/verify-governance-onchain.mjs --migrate   # register missing proposals on-chain
 */
import { createPublicClient, formatUnits, http, keccak256, stringToBytes } from "viem";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(root, ".env.local");
const migrate = process.argv.includes("--migrate");

function loadEnv() {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnv();

const rpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
const chainId = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;
const ledgerMode = process.env.PAY_HUB_LEDGER_MODE || "hybrid";

let contracts = {};
try {
  contracts = JSON.parse(process.env.PAY_HUB_ONCHAIN_CONTRACTS_JSON || "{}");
} catch {
  contracts = {};
}

const governanceAddr = contracts.governance?.trim() || process.env.GOVERNANCE?.trim();
const gatAddr = contracts.gatToken?.trim() || process.env.VITE_GAT_TOKEN_ADDRESS?.trim();

const GOVERNANCE_ABI = [
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
  { type: "function", name: "quorumBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "hasRole", stateMutability: "view", inputs: [{ type: "bytes32" }, { type: "address" }], outputs: [{ type: "bool" }] },
];

const GAT_ABI = [
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

const RELAYER_ROLE = keccak256(stringToBytes("RELAYER_ROLE"));

const client = createPublicClient({
  chain: {
    id: chainId,
    name: "Sidra",
    nativeCurrency: { name: "SDA", symbol: "SDA", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  },
  transport: http(rpc),
});

function proposalKey(id) {
  return keccak256(stringToBytes(`governance:${id}`));
}

async function loadFirestoreProposals() {
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saRaw) return [];
  const { initializeApp, cert, getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(saRaw)) });
  }
  const snap = await getFirestore()
    .collection("governance_proposals")
    .orderBy("createdAt", "desc")
    .limit(30)
    .get()
    .catch(() => null);
  if (!snap?.size) return [];
  return snap.docs.map((d) => ({
    id: d.id,
    title: d.data().title ?? "",
    status: d.data().status ?? "active",
    yesVotes: d.data().yesVotes ?? 0,
    noVotes: d.data().noVotes ?? 0,
    onChainCloseTxHash: d.data().onChainCloseTxHash,
  }));
}

async function readOnChainProposal(proposalId) {
  const row = await client.readContract({
    address: governanceAddr,
    abi: GOVERNANCE_ABI,
    functionName: "proposals",
    args: [proposalKey(proposalId)],
  });
  return {
    yesWeight: row[0],
    noWeight: row[1],
    endTime: row[2],
    closed: row[3],
    metadataRef: row[4],
    registered: row[2] !== 0n,
  };
}

async function migrateMissing(proposals) {
  const { ensureGovernanceProposalOnChain } = await import(
    path.join(root, "server/onChainProtocolAdapter.ts").replace(/\\/g, "/")
  ).catch(() => null);

  if (!ensureGovernanceProposalOnChain) {
    console.log("\n⚠ --migrate requires tsx runtime. Run:");
    console.log("  npx tsx scripts/migrate-governance-proposals.mjs");
    return;
  }

  for (const p of proposals) {
    const on = await readOnChainProposal(p.id);
    if (on.registered) continue;
    const result = await ensureGovernanceProposalOnChain({
      proposalId: p.id,
      metadataRef: `firestore:${p.id}`,
    });
    console.log(`  migrated ${p.id.slice(0, 8)}… tx=${result.txHash ?? "skip"}`);
  }
}

async function main() {
  console.log("=== Garuda Governance On-Chain Verification ===\n");
  console.log("Ledger mode:", ledgerMode);
  console.log("RPC:", rpc);
  console.log("Governance:", governanceAddr ?? ", ");
  console.log("GAT:", gatAddr ?? ", \n");

  if (!governanceAddr?.startsWith("0x")) {
    console.error("❌ governance address not configured");
    process.exit(1);
  }

  let ok = true;
  const relayer =
    process.env.PAY_HUB_RELAYER_ADDRESS?.trim()
    || process.env.PROTOCOL_OWNER_ADDRESS?.trim();

  const quorumBps = await client.readContract({
    address: governanceAddr,
    abi: GOVERNANCE_ABI,
    functionName: "quorumBps",
  });
  console.log(`✓ Contract reachable, quorumBps=${quorumBps} (${Number(quorumBps) / 100}%)`);

  if (relayer?.startsWith("0x")) {
    const hasRelayer = await client.readContract({
      address: governanceAddr,
      abi: GOVERNANCE_ABI,
      functionName: "hasRole",
      args: [RELAYER_ROLE, relayer],
    });
    console.log(`${hasRelayer ? "✓" : "✗"} Relayer ${relayer} has RELAYER_ROLE: ${hasRelayer}`);
    if (!hasRelayer) ok = false;
  } else {
    console.log("⚠ PAY_HUB_RELAYER_ADDRESS not set, skip relayer role check");
  }

  if (gatAddr?.startsWith("0x")) {
    const supply = await client.readContract({
      address: gatAddr,
      abi: GAT_ABI,
      functionName: "totalSupply",
    });
    console.log(`✓ GAT totalSupply: ${formatUnits(supply, 18)}`);
  }

  const proposals = await loadFirestoreProposals();
  console.log(`\nFirestore proposals: ${proposals.length}`);

  let onChain = 0;
  let missing = 0;
  let closed = 0;

  console.log("\n── Proposal sync status ──");
  for (const p of proposals) {
    try {
      const on = await readOnChainProposal(p.id);
      if (!on.registered) {
        missing += 1;
        console.log(`  ✗ ${p.id.slice(0, 10)}… "${p.title.slice(0, 40)}", NOT on-chain`);
        ok = false;
      } else {
        onChain += 1;
        const end = new Date(Number(on.endTime) * 1000).toISOString().slice(0, 10);
        const status = on.closed ? "closed" : "open";
        if (on.closed) closed += 1;
        console.log(
          `  ✓ ${p.id.slice(0, 10)}… yes=${formatUnits(on.yesWeight, 18)} no=${formatUnits(on.noWeight, 18)} end=${end} ${status}`,
        );
      }
    } catch (err) {
      console.log(`  ✗ ${p.id.slice(0, 10)}… read error: ${err.message ?? err}`);
      ok = false;
    }
  }

  console.log(`\nSummary: ${onChain} on-chain, ${missing} missing, ${closed} closed on-chain`);

  const apiBase = process.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "") || "https://app.garudaprime.id/api";
  for (const route of ["/protocol/governance/vote", "/protocol/governance/proposal", "/protocol/governance/close"]) {
    try {
      const res = await fetch(`${apiBase}${route}`, { method: "OPTIONS" });
      console.log(`${res.ok || res.status === 204 ? "✓" : "⚠"} API route ${route}, HTTP ${res.status}`);
    } catch (err) {
      console.log(`✗ API route ${route}, ${err.message ?? err}`);
      ok = false;
    }
  }

  if (migrate && missing > 0) {
    console.log("\n── Migrating missing proposals ──");
    await migrateMissing(proposals.filter(async (p) => !(await readOnChainProposal(p.id)).registered));
  } else if (missing > 0) {
    console.log("\nTo register missing proposals on-chain:");
    console.log("  npx tsx scripts/migrate-governance-proposals.mjs");
  }

  console.log(`\n${ok ? "✓ Governance on-chain verification PASSED" : "⚠ Governance on-chain verification has gaps"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
