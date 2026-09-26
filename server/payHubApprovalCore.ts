import { createPublicClient, formatUnits, http, type Address } from "viem";
import { isPayHubOnChainConfigured, loadPayHubOnChainContracts } from "./payHubLedgerMode.js";

const ERC20_ALLOWANCE_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

const sidraRpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
const sidraChainId = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;

const MIN_APPROVAL_GAT = Number(process.env.PAY_HUB_MIN_APPROVAL_GAT ?? 1_000_000);

function gatDecimals(): number {
  const n = Number(process.env.VITE_GAT_TOKEN_DECIMALS ?? 18);
  return Number.isFinite(n) && n > 0 ? n : 18;
}

export function resolvePayHubPaymentSpender(): Address | null {
  const contracts = loadPayHubOnChainContracts();
  const raw = contracts?.payment?.trim();
  return raw?.startsWith("0x") ? (raw as Address) : null;
}

export function resolvePayHubGatToken(): Address | null {
  const contracts = loadPayHubOnChainContracts();
  const raw = contracts?.gatToken?.trim()
    || process.env.VITE_GAT_TOKEN_ADDRESS?.trim();
  return raw?.startsWith("0x") ? (raw as Address) : null;
}

export async function getPayHubGatAllowance(ownerAddress: string): Promise<{
  owner: string;
  spender: string;
  allowanceGat: number;
  sufficient: boolean;
  configured: boolean;
} | null> {
  if (!isPayHubOnChainConfigured()) return null;

  const token = resolvePayHubGatToken();
  const spender = resolvePayHubPaymentSpender();
  if (!token || !spender || !ownerAddress.startsWith("0x")) return null;

  const client = createPublicClient({
    chain: {
      id: sidraChainId,
      name: "Sidra",
      nativeCurrency: { name: "SDA", symbol: "SDA", decimals: 18 },
      rpcUrls: { default: { http: [sidraRpc] } },
    },
    transport: http(sidraRpc),
  });

  const allowance = await client.readContract({
    address: token,
    abi: ERC20_ALLOWANCE_ABI,
    functionName: "allowance",
    args: [ownerAddress as Address, spender],
  });

  const allowanceGat = Number(formatUnits(allowance, gatDecimals()));
  return {
    owner: ownerAddress,
    spender,
    allowanceGat: Number.isFinite(allowanceGat) ? allowanceGat : 0,
    sufficient: allowanceGat >= MIN_APPROVAL_GAT,
    configured: true,
  };
}
