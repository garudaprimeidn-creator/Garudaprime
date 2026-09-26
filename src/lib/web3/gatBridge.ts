import { encodeFunctionData, keccak256, parseUnits, toHex, type Hash } from "viem";
import { ERC20_ABI } from "./contracts/erc20Abi";
import { GAT_TOKEN, isGatContractConfigured } from "./gatToken";
import { ensureSignerForAddress } from "./walletProviderResolution";
import type { WalletProvider } from "./walletService";
  {
    type: "function",
    name: "lock",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "depositId", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export const isBridgeVaultConfigured = () =>
  Boolean(import.meta.env.VITE_GAT_BRIDGE_VAULT_ADDRESS?.trim());

const vaultAddress = () =>
  import.meta.env.VITE_GAT_BRIDGE_VAULT_ADDRESS?.trim() as `0x${string}`;

export type BridgeLockResult = {
  depositId: `0x${string}`;
  approveTxHash?: Hash;
  lockTxHash: Hash;
};

/** Approve + lock GAT into bridge vault on Sidra (TAHAP 2 prep) */
export const lockGatForBridge = async (
  from: string,
  amount: string,
  provider?: WalletProvider,
): Promise<BridgeLockResult> => {
  if (!isGatContractConfigured() || !isBridgeVaultConfigured()) {
    throw new Error("Bridge not configured");
  }

  const eth = await ensureSignerForAddress(from, provider);
  if (!eth) throw new Error("No wallet provider");

  const token = GAT_TOKEN.address!;
  const vault = vaultAddress();
  const value = parseUnits(amount, GAT_TOKEN.decimals);
  const depositId = keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))));

  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [vault, value],
  });

  const approveTxHash = (await eth.request({
    method: "eth_sendTransaction",
    params: [{ from, to: token, data: approveData }],
  })) as Hash;

  const lockData = encodeFunctionData({
    abi: BRIDGE_VAULT_ABI,
    functionName: "lock",
    args: [value, depositId],
  });

  const lockTxHash = (await eth.request({
    method: "eth_sendTransaction",
    params: [{ from, to: vault, data: lockData }],
  })) as Hash;

  return { depositId, approveTxHash, lockTxHash };
};
