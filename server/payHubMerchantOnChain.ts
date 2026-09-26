/**
 * Sync personal merchant vault addresses on GarudaMerchantContract / Marketplace (admin).
 */
import { createWalletClient, http, keccak256, stringToBytes, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { isPayHubOnChainConfigured, loadPayHubOnChainContracts } from "./payHubLedgerMode.js";
import { resolvePrimaryWalletForUid } from "./chainBalanceService.js";

const sidraRpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
const sidraChainId = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;

const VAULT_ABI = [
  {
    type: "function",
    name: "setMerchantVault",
    stateMutability: "nonpayable",
    inputs: [
      { name: "merchantId", type: "bytes32" },
      { name: "vault", type: "address" },
    ],
    outputs: [],
  },
] as const;

function adminKey(): Hex | null {
  const key =
    process.env.PAY_HUB_RELAYER_PRIVATE_KEY?.trim()
    || process.env.PROTOCOL_OWNER_PRIVATE_KEY?.trim()
    || process.env.DEPLOYER_PRIVATE_KEY?.trim();
  return key?.startsWith("0x") ? (key as Hex) : null;
}

function merchantIdBytes(merchantId: string): Hex {
  return keccak256(stringToBytes(merchantId));
}

export async function registerMerchantVaultOnChain(
  merchantId: string,
  vaultAddress: string,
): Promise<{ ok: boolean; txHashes?: string[] }> {
  if (!isPayHubOnChainConfigured() || !vaultAddress.startsWith("0x")) {
    return { ok: false };
  }

  const contracts = loadPayHubOnChainContracts()!;
  const key = adminKey();
  if (!key) return { ok: false };

  const account = privateKeyToAccount(key);
  const client = createWalletClient({
    account,
    chain: {
      id: sidraChainId,
      name: "Sidra",
      nativeCurrency: { name: "SDA", symbol: "SDA", decimals: 18 },
      rpcUrls: { default: { http: [sidraRpc] } },
    },
    transport: http(sidraRpc),
  });

  const id = merchantIdBytes(merchantId);
  const vault = vaultAddress as Address;
  const txHashes: string[] = [];

  for (const [label, address] of [
    ["merchant", contracts.merchant],
    ["marketplace", contracts.marketplace],
  ] as const) {
    if (!address?.startsWith("0x")) continue;
    try {
      const hash = await client.writeContract({
        address: address as Address,
        abi: VAULT_ABI,
        functionName: "setMerchantVault",
        args: [id, vault],
      });
      txHashes.push(hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("already") && !msg.includes("identical")) {
        throw err;
      }
    }
  }

  return { ok: txHashes.length > 0, txHashes };
}

export async function syncPersonalMerchantVaultForUid(
  uid: string,
  merchantId: string,
): Promise<void> {
  const vault = await resolvePrimaryWalletForUid(uid);
  if (!vault) return;
  await registerMerchantVaultOnChain(merchantId, vault).catch(() => undefined);
}
