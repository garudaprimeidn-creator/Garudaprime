import { createPublicClient, encodeFunctionData, http, maxUint256, type Address, type Hash } from "viem";
import { ERC20_ABI } from "../web3/contracts/erc20Abi";
import { GAT_TOKEN, isGatContractConfigured } from "../web3/gatToken";
import { SIDRA_CHAIN } from "../web3/sidraNetwork";
import { ensureSignerForAddress } from "../web3/walletProviderResolution";
import { ensureSidraNetwork } from "../web3/ensureSidraNetwork";
import { withWalletTimeout, WALLET_CONNECT_TIMEOUT_MS } from "../web3/walletTimeout";
import { isPayHubApiConfigured, getPayHubAuthToken } from "./payHubApi";
import type { WalletProvider } from "../web3/walletService";

const APPROVAL_STORAGE_PREFIX = "garuda_payhub_approved_";
const MIN_APPROVAL_GAT = 1_000_000;

export function resolvePayHubPaymentSpender(): Address | null {
  const raw = import.meta.env.VITE_PAY_HUB_ONCHAIN_PAYMENT?.trim();
  return raw?.startsWith("0x") ? (raw as Address) : null;
}

function sidraClient() {
  return createPublicClient({
    chain: {
      id: SIDRA_CHAIN.chainId,
      name: SIDRA_CHAIN.name,
      nativeCurrency: { name: "SDA", symbol: "SDA", decimals: 18 },
      rpcUrls: { default: { http: [SIDRA_CHAIN.rpcUrl] } },
    },
    transport: http(SIDRA_CHAIN.rpcUrl),
  });
}

export async function fetchPayHubApprovalStatus(): Promise<{
  sufficient: boolean;
  allowanceGat: number;
  walletAddress: string | null;
} | null> {
  if (!isPayHubApiConfigured()) return null;
  const token = await getPayHubAuthToken();
  if (!token) return null;

  const base = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");
  if (!base) return null;

  const res = await fetch(`${base}/pay/approval`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json() as {
    sufficient?: boolean;
    allowanceGat?: number;
    walletAddress?: string | null;
  };
  return {
    sufficient: Boolean(data.sufficient),
    allowanceGat: Number(data.allowanceGat ?? 0),
    walletAddress: data.walletAddress ?? null,
  };
}

function approvalCached(address: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(`${APPROVAL_STORAGE_PREFIX}${address.toLowerCase()}`) === "1";
}

function markApprovalCached(address: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${APPROVAL_STORAGE_PREFIX}${address.toLowerCase()}`, "1");
}

/**
 * One-time GAT approve for Garuda Pay Hub payment contract (embedded / WC wallet).
 * Fails silently, Firestore ledger still works in shadow without approval.
 */
export async function ensurePayHubGatApproval(
  owner: string,
  provider?: WalletProvider,
  options?: { force?: boolean },
): Promise<{ approved: boolean; txHash?: Hash }> {
  if (!isGatContractConfigured()) return { approved: false };

  const spender = resolvePayHubPaymentSpender();
  if (!spender) return { approved: false };

  const ownerLc = owner.toLowerCase();
  if (!options?.force && approvalCached(owner)) {
    return { approved: true };
  }

  try {
    const client = sidraClient();
    const allowance = await client.readContract({
      address: GAT_TOKEN.address!,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner as Address, spender],
    });

    const decimals = GAT_TOKEN.decimals;
    const minUnits = BigInt(MIN_APPROVAL_GAT) * 10n ** BigInt(decimals);
    if (allowance >= minUnits) {
      markApprovalCached(owner);
      return { approved: true };
    }

    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, maxUint256],
    });

    const eth = await withWalletTimeout(
      ensureSignerForAddress(owner, provider),
      WALLET_CONNECT_TIMEOUT_MS,
      "Dompet tidak merespons, buka MetaMask/Trust atau Garuda Prime lalu coba lagi",
      "wallet/timeout",
    );
    await ensureSidraNetwork(eth);
    const txHash = (await eth.request({
      method: "eth_sendTransaction",
      params: [{ from: owner, to: GAT_TOKEN.address, data }],
    })) as Hash;

    markApprovalCached(owner);
    return { approved: true, txHash };
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : "";
    if (msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel")) {
      throw Object.assign(e instanceof Error ? e : new Error("User rejected"), { code: "wallet/user-rejected" });
    }
    return { approved: false };
  }
}
