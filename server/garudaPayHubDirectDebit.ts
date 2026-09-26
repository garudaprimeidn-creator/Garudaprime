/**
 * Phase 4, Garuda Native Wallet direct debit on PaymentContract.
 * Payer signs directTransfer; relayer path kept as fallback for external wallets.
 */
import {
  encodeFunctionData,
  http,
  keccak256,
  maxUint256,
  stringToBytes,
  type Address,
  type Hex,
} from "viem";
import { FieldValue } from "firebase-admin/firestore";
import { getPayHubGatAllowance, resolvePayHubGatToken, resolvePayHubPaymentSpender } from "./payHubApprovalCore.js";
import { resolveGarudaWalletRecord, derivedGarudaWalletAddress, assertGarudaWalletOwner } from "./garudaWalletCore.js";
import { signAndBroadcastGarudaTransaction } from "./garudaWalletSigner.js";
import { isPayHubOnChainConfigured, loadPayHubOnChainContracts } from "./payHubLedgerMode.js";
import { ensureGarudaWalletGas, estimateGarudaTxGasSda } from "./garudaWalletGasSponsor.js";
import { adminDb } from "./firebaseAdmin.js";

const JOBS_COL = "pay_relayer_jobs";

const DIRECT_TRANSFER_ABI = [
  {
    type: "function",
    name: "directTransfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "refId", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const sidraRpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
const sidraChainId = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;

export function isGarudaPaymentDirectDebitEnabled(): boolean {
  const raw = process.env.GARUDA_PAYMENT_DIRECT_DEBIT?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export function isGarudaPaymentAutoApproveEnabled(): boolean {
  const raw = process.env.GARUDA_PAYMENT_AUTO_APPROVE?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

/**
 * Ensure Garuda native wallet has sufficient GAT allowance for PaymentContract.
 * Only runs when GARUDA_PAYMENT_AUTO_APPROVE=true and user owns a Garuda native wallet.
 */
export async function ensureGarudaPaymentContractApproval(uid: string): Promise<{
  approved: boolean;
  txHash?: string;
  skipped?: boolean;
}> {
  if (!isGarudaPaymentAutoApproveEnabled() || !isPayHubOnChainConfigured()) {
    return { approved: false, skipped: true };
  }

  const garudaWallet = await resolveGarudaWalletRecord(uid);
  if (!garudaWallet || garudaWallet.status !== "active") {
    return { approved: false, skipped: true };
  }

  const owner = derivedGarudaWalletAddress(uid);
  const allowance = await getPayHubGatAllowance(owner);
  if (allowance?.sufficient) {
    return { approved: true };
  }

  const token = resolvePayHubGatToken();
  const spender = resolvePayHubPaymentSpender();
  if (!token || !spender) {
    return { approved: false, skipped: true };
  }

  const data = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: "approve",
    args: [spender, maxUint256],
  });

  const estimated = await estimateGarudaTxGasSda(owner, {
    to: token,
    data,
    value: "0x0",
  }).catch(() => 0.06);

  await ensureGarudaWalletGas({
    uid,
    walletAddress: owner,
    estimatedGasSda: estimated,
    txCount: 1,
  });

  const { txHash } = await signAndBroadcastGarudaTransaction({
    uid,
    address: owner,
    transaction: {
      from: owner,
      to: token,
      data,
      value: "0x0",
    },
  });

  return { approved: true, txHash };
}

function gatDecimals(): number {
  const n = Number(process.env.VITE_GAT_TOKEN_DECIMALS ?? 18);
  return Number.isFinite(n) && n > 0 ? n : 18;
}

function toGatUnits(amount: number): bigint {
  const str = amount.toLocaleString("en-US", { maximumFractionDigits: 8, useGrouping: false });
  const [whole, frac = ""] = str.split(".");
  const padded = (frac + "0".repeat(gatDecimals())).slice(0, gatDecimals());
  return BigInt(whole) * 10n ** BigInt(gatDecimals()) + BigInt(padded || "0");
}

function refToBytes32(refId: string): Hex {
  return keccak256(stringToBytes(refId));
}

/** True when uid has active Garuda native wallet suitable for direct debit. */
export async function canUseGarudaDirectDebit(
  uid: string,
  addressHint?: string,
): Promise<{
  eligible: boolean;
  walletAddress?: string;
}> {
  if (!isGarudaPaymentDirectDebitEnabled() || !isPayHubOnChainConfigured()) {
    return { eligible: false };
  }
  const garudaWallet = await resolveGarudaWalletRecord(uid, addressHint);
  if (!garudaWallet || garudaWallet.status !== "active") {
    return { eligible: false };
  }
  return { eligible: true, walletAddress: garudaWallet.walletAddress };
}

/**
 * Execute PaymentContract.directTransfer from Garuda native wallet (no relayer pull).
 */
export async function executeGarudaDirectPaymentTransfer(input: {
  uid: string;
  fromAddress: string;
  toAddress: string;
  amountGat: number;
  refId: string;
  jobType: string;
  jobExtra?: Record<string, unknown>;
}): Promise<{ txHash: string; pending?: boolean }> {
  if (!isGarudaPaymentDirectDebitEnabled() || !isPayHubOnChainConfigured()) {
    throw new Error("Garuda payment direct debit not enabled");
  }

  const owner = derivedGarudaWalletAddress(input.uid);
  await assertGarudaWalletOwner(input.uid, input.fromAddress);

  const contracts = loadPayHubOnChainContracts()!;
  const paymentAddr = contracts.payment?.trim();
  if (!paymentAddr?.startsWith("0x")) {
    throw new Error("PaymentContract not configured");
  }

  const data = encodeFunctionData({
    abi: DIRECT_TRANSFER_ABI,
    functionName: "directTransfer",
    args: [
      input.toAddress as Address,
      toGatUnits(input.amountGat),
      refToBytes32(input.refId),
    ],
  });

  const [estimated, allowance] = await Promise.all([
    estimateGarudaTxGasSda(owner, {
      to: paymentAddr,
      data,
      value: "0x0",
    }).catch(() => 0.08),
    getPayHubGatAllowance(owner).catch(() => null),
  ]);
  const needsApproval = !allowance?.sufficient;

  await ensureGarudaWalletGas({
    uid: input.uid,
    walletAddress: owner,
    estimatedGasSda: estimated,
    txCount: needsApproval ? 2 : 1,
  });

  if (needsApproval) {
    await ensureGarudaPaymentContractApproval(input.uid);
  }

  const { txHash, pending } = await signAndBroadcastGarudaTransaction({
    uid: input.uid,
    address: owner,
    transaction: {
      from: owner,
      to: paymentAddr,
      data,
      value: "0x0",
    },
  });

  try {
    await adminDb().collection(JOBS_COL).add({
      type: input.jobType,
      uid: input.uid,
      toAddress: input.toAddress.toLowerCase(),
      amountGat: input.amountGat,
      txHash,
      refId: input.refId,
      directDebit: true,
      idempotencyKey: `direct:${input.jobType}:${input.refId}`,
      ...input.jobExtra,
      status: pending ? "pending" : "confirmed",
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("RESOURCE_EXHAUSTED") && !msg.toLowerCase().includes("quota exceeded")) {
      throw err;
    }
  }

  return { txHash, pending };
}
