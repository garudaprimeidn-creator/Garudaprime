import { createWalletClient, createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ANCHOR_ABI = [
  {
    type: "function",
    name: "latest",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "snapshotHash", type: "bytes32" },
          { name: "ledgerCount", type: "uint256" },
          { name: "totalLedgerGatMicro", type: "uint256" },
          { name: "anchoredAt", type: "uint40" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "anchorCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "anchorPayHubLedger",
    stateMutability: "nonpayable",
    inputs: [
      { name: "snapshotHash", type: "bytes32" },
      { name: "ledgerCount", type: "uint256" },
      { name: "totalLedgerGatMicro", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

function ledgerAnchorAddress(): Hex | null {
  const raw =
    process.env.PAY_HUB_LEDGER_ANCHOR_ADDRESS?.trim()
    || process.env.VITE_PAY_HUB_LEDGER_ANCHOR_ADDRESS?.trim();
  return raw?.startsWith("0x") ? (raw as Hex) : null;
}

function signerKey(): Hex | null {
  const key =
    process.env.PROTOCOL_OWNER_PRIVATE_KEY?.trim()
    || process.env.DEPLOYER_PRIVATE_KEY?.trim();
  return key?.startsWith("0x") ? (key as Hex) : null;
}

function sidraChain() {
  const rpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
  const id = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;
  return {
    id,
    name: "Sidra",
    nativeCurrency: { name: "SDA", symbol: "SDA", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  } as const;
}

export function isOnChainAnchorConfigured(): boolean {
  return Boolean(ledgerAnchorAddress() && signerKey());
}

export async function fetchOnChainLatestAnchor() {
  const contract = ledgerAnchorAddress();
  if (!contract) return null;
  try {
    const chain = sidraChain();
    const client = createPublicClient({
      chain,
      transport: http(chain.rpcUrls.default.http[0]),
    });
    const latest = await client.readContract({
      address: contract,
      abi: ANCHOR_ABI,
      functionName: "latest",
    });
    const zero = `0x${"0".repeat(64)}`;
    if (`${latest.snapshotHash}`.toLowerCase() === zero) return null;
    return {
      contract,
      snapshotHash: latest.snapshotHash,
      ledgerCount: Number(latest.ledgerCount),
      totalLedgerGat: Number(latest.totalLedgerGatMicro) / 1e6,
      anchoredAt: Number(latest.anchoredAt) * 1000,
    };
  } catch {
    return null;
  }
}

export async function anchorSettlementOnChain(input: {
  snapshotHash: string;
  ledgerCount: number;
  totalLedgerGat: number;
}): Promise<{ txHash: string } | { skipped: true; reason: string }> {
  const contract = ledgerAnchorAddress();
  const key = signerKey();
  if (!contract || !key) {
    return { skipped: true, reason: "on_chain_anchor_not_configured" };
  }

  const hash = input.snapshotHash.startsWith("0x")
    ? (input.snapshotHash as Hex)
    : (`0x${input.snapshotHash}` as Hex);
  const gatMicro = BigInt(Math.round(input.totalLedgerGat * 1e6));
  const account = privateKeyToAccount(key);
  const chain = sidraChain();
  const wallet = createWalletClient({
    account,
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  });

  const txHash = await wallet.writeContract({
    chain,
    account,
    address: contract,
    abi: ANCHOR_ABI,
    functionName: "anchorPayHubLedger",
    args: [hash, BigInt(input.ledgerCount), gatMicro],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
  return { txHash };
}
