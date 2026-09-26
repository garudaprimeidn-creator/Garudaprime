/**
 * On-chain settlement adapter (ADR-005). Invoked in shadow/onchain modes only.
 * Does not replace Firestore paths until PAY_HUB_LEDGER_MODE=onchain.
 */
import { createWalletClient, http, keccak256, stringToBytes, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import {
  isPayHubOnChainConfigured,
  loadPayHubOnChainContracts,
  shouldShadowWriteOnChain,
} from "./payHubLedgerMode.js";
import { isOnChainWritePrimaryFor } from "./payHubOnChainWrite.js";
import { resolvePrimaryWalletForUid } from "./chainBalanceService.js";
import {
  derivedGarudaWalletAddress,
  isGarudaNativeWalletEnabled,
  isUserPhraseWalletAddress,
  resolveCanonicalGarudaWalletAddress,
} from "./garudaWalletCore.js";
import { isFirestoreQuotaError } from "./firestoreQuota.js";
import {
  canUseGarudaDirectDebit,
  executeGarudaDirectPaymentTransfer,
} from "./garudaPayHubDirectDebit.js";

const JOBS_COL = "pay_relayer_jobs";

const sidraRpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
const sidraChainId = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;

const RELAY_ABI = [
  {
    type: "function",
    name: "relayTransfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "refId", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "relayCheckout",
    stateMutability: "nonpayable",
    inputs: [
      { name: "buyer", type: "address" },
      { name: "merchantId", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "checkoutRef", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

function payHubBackingAddress(): string | null {
  const candidates = [
    process.env.VITE_PAY_HUB_BACKING_ADDRESS,
    process.env.PAY_HUB_BACKING_ADDRESS,
    process.env.PROTOCOL_OWNER_ADDRESS,
  ];
  for (const raw of candidates) {
    const v = raw?.trim();
    if (v?.startsWith("0x")) return v.toLowerCase();
  }
  const key = relayerKey();
  if (!key) return null;
  return privateKeyToAccount(key).address.toLowerCase();
}

function relayerKey(): Hex | null {
  const key =
    process.env.PAY_HUB_RELAYER_PRIVATE_KEY?.trim()
    || process.env.PROTOCOL_OWNER_PRIVATE_KEY?.trim()
    || process.env.DEPLOYER_PRIVATE_KEY?.trim();
  return key?.startsWith("0x") ? (key as Hex) : null;
}

function gatDecimals(): number {
  const n = Number(process.env.VITE_GAT_TOKEN_DECIMALS ?? 18);
  return Number.isFinite(n) && n > 0 ? n : 18;
}

function toUnits(amount: number): bigint {
  const str = amount.toLocaleString("en-US", { maximumFractionDigits: 8, useGrouping: false });
  const [whole, frac = ""] = str.split(".");
  const padded = (frac + "0".repeat(gatDecimals())).slice(0, gatDecimals());
  return BigInt(whole) * 10n ** BigInt(gatDecimals()) + BigInt(padded || "0");
}

function refToBytes32(refId: string): Hex {
  return keccak256(stringToBytes(refId));
}

function merchantIdToBytes32(merchantId: string): Hex {
  return keccak256(stringToBytes(merchantId));
}

function walletClient() {
  const key = relayerKey();
  if (!key) throw new Error("Relayer private key not configured");
  const account = privateKeyToAccount(key);
  return createWalletClient({
    account,
    chain: {
      id: sidraChainId,
      name: "Sidra",
      nativeCurrency: { name: "SDA", symbol: "SDA", decimals: 18 },
      rpcUrls: { default: { http: [sidraRpc] } },
    },
    transport: http(sidraRpc),
  });
}

async function queueJob(doc: Record<string, unknown>) {
  try {
    await adminDb().collection(JOBS_COL).add({
      ...doc,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (!isFirestoreQuotaError(err)) throw err;
    /* audit queue is best-effort, on-chain tx already submitted */
  }
}

export type OnChainRelayResult = {
  txHash: string;
  blockNumber?: number;
  pending?: boolean;
};

async function relayPaymentTransfer(input: {
  fromUid: string;
  toAddress: string;
  amountGat: number;
  refId: string;
  jobType: string;
  jobExtra?: Record<string, unknown>;
  fromAddressHint?: string;
}): Promise<OnChainRelayResult> {
  if (!shouldShadowWriteOnChain() || !isPayHubOnChainConfigured()) {
    throw new Error("On-chain Pay Hub not configured");
  }

  const contracts = loadPayHubOnChainContracts()!;
  let from = input.fromAddressHint?.trim() ?? "";
  if (!from.startsWith("0x")) {
    try {
      from = (await resolvePrimaryWalletForUid(input.fromUid)) ?? "";
    } catch (err) {
      if (isFirestoreQuotaError(err) && isGarudaNativeWalletEnabled()) {
        from = derivedGarudaWalletAddress(input.fromUid);
      } else {
        throw err;
      }
    }
  }
  const canonical = await resolveCanonicalGarudaWalletAddress(input.fromUid, from);
  const phrasePayer = from.startsWith("0x") && await isUserPhraseWalletAddress(input.fromUid, from);
  if (canonical && !phrasePayer) from = canonical;
  if (!from.startsWith("0x")) throw new Error("Embedded wallet not found");

  const direct = await canUseGarudaDirectDebit(input.fromUid, from);
  if (direct.eligible && direct.walletAddress?.toLowerCase() === from.toLowerCase()) {
    const result = await executeGarudaDirectPaymentTransfer({
      uid: input.fromUid,
      fromAddress: from,
      toAddress: input.toAddress,
      amountGat: input.amountGat,
      refId: input.refId,
      jobType: input.jobType,
      jobExtra: input.jobExtra,
    });
    return { txHash: result.txHash, pending: result.pending };
  }

  const client = walletClient();
  const hash = await client.writeContract({
    address: contracts.payment as Address,
    abi: RELAY_ABI,
    functionName: "relayTransfer",
    args: [
      from as Address,
      input.toAddress as Address,
      toUnits(input.amountGat),
      refToBytes32(input.refId),
    ],
  });

  await queueJob({
    type: input.jobType,
    uid: input.fromUid,
    toAddress: input.toAddress.toLowerCase(),
    amountGat: input.amountGat,
    txHash: hash,
    refId: input.refId,
    idempotencyKey: `onchain:${input.jobType}:${input.refId}`,
    ...input.jobExtra,
  });

  return { txHash: hash };
}

export async function relayP2POnChain(input: {
  senderUid: string;
  recipientAddress: string;
  amountGat: number;
  refId: string;
}): Promise<OnChainRelayResult | null> {
  const required = isOnChainWritePrimaryFor("transfer");
  if (!shouldShadowWriteOnChain() || !isPayHubOnChainConfigured()) {
    if (required) throw new Error("On-chain transfer not configured");
    return null;
  }

  try {
    return await relayPaymentTransfer({
      fromUid: input.senderUid,
      toAddress: input.recipientAddress,
      amountGat: input.amountGat,
      refId: input.refId,
      jobType: "transfer_gat",
    });
  } catch (err) {
    if (required) throw err;
    return null;
  }
}

/** Protocol fee: pull fee GAT from user embedded wallet to Pay Hub backing EOA. */
export async function relayProtocolFeeOnChain(input: {
  payerUid: string;
  payerAddress?: string;
  feeAmountGat: number;
  refId: string;
}): Promise<OnChainRelayResult | null> {
  if (input.feeAmountGat <= 0) return null;
  const treasury = payHubBackingAddress();
  if (!treasury) {
    if (isOnChainWritePrimaryFor("transfer") || isOnChainWritePrimaryFor("merchant")) {
      throw new Error("Pay Hub backing address not configured");
    }
    return null;
  }
  const required =
    isOnChainWritePrimaryFor("transfer")
    || isOnChainWritePrimaryFor("merchant")
    || isOnChainWritePrimaryFor("market");
  if (!shouldShadowWriteOnChain() || !isPayHubOnChainConfigured()) {
    if (required) throw new Error("On-chain fee relay not configured");
    return null;
  }
  try {
    return await relayPaymentTransfer({
      fromUid: input.payerUid,
      fromAddressHint: input.payerAddress,
      toAddress: treasury,
      amountGat: input.feeAmountGat,
      refId: `${input.refId}:fee`,
      jobType: "protocol_fee",
    });
  } catch (err) {
    if (required) throw err;
    return null;
  }
}

export async function relayWithdrawFromEmbedded(input: {
  uid: string;
  toAddress: string;
  amountGat: number;
  refId: string;
}): Promise<OnChainRelayResult | null> {
  const required = isOnChainWritePrimaryFor("withdraw");
  if (!shouldShadowWriteOnChain() || !isPayHubOnChainConfigured()) {
    if (required) throw new Error("On-chain withdraw not configured");
    return null;
  }
  try {
    return await relayPaymentTransfer({
      fromUid: input.uid,
      toAddress: input.toAddress,
      amountGat: input.amountGat,
      refId: input.refId,
      jobType: "withdraw_gat_embedded",
    });
  } catch (err) {
    if (required) throw err;
    return null;
  }
}

export async function relayMerchantPayOnChain(input: {
  payerUid: string;
  payerAddress?: string;
  merchantId: string;
  amountGat: number;
  refId: string;
  merchantVaultAddress: string;
}): Promise<OnChainRelayResult | null> {
  const required = isOnChainWritePrimaryFor("merchant");
  if (!shouldShadowWriteOnChain() || !isPayHubOnChainConfigured()) {
    if (required) throw new Error("On-chain merchant pay not configured");
    return null;
  }
  try {
    return await relayPaymentTransfer({
      fromUid: input.payerUid,
      fromAddressHint: input.payerAddress,
      toAddress: input.merchantVaultAddress,
      amountGat: input.amountGat,
      refId: input.refId,
      jobType: "merchant_settle",
      jobExtra: { merchantId: input.merchantId },
    });
  } catch (err) {
    if (required) throw err;
    return null;
  }
}

export async function relayMarketCheckoutOnChain(input: {
  buyerUid: string;
  merchantId: string;
  amountGat: number;
  checkoutRef: string;
}): Promise<OnChainRelayResult | null> {
  const required = isOnChainWritePrimaryFor("market");
  if (!shouldShadowWriteOnChain() || !isPayHubOnChainConfigured()) {
    if (required) throw new Error("On-chain market checkout not configured");
    return null;
  }

  const contracts = loadPayHubOnChainContracts()!;
  const buyer = await resolvePrimaryWalletForUid(input.buyerUid);
  if (!buyer) {
    if (required) throw new Error("Buyer embedded wallet not found");
    return null;
  }

  try {
    const client = walletClient();
    const hash = await client.writeContract({
      address: contracts.marketplace as Address,
      abi: RELAY_ABI,
      functionName: "relayCheckout",
      args: [
        buyer as Address,
        merchantIdToBytes32(input.merchantId),
        toUnits(input.amountGat),
        refToBytes32(input.checkoutRef),
      ],
    });

    await queueJob({
      type: "market_checkout",
      uid: input.buyerUid,
      merchantId: input.merchantId,
      amountGat: input.amountGat,
      txHash: hash,
      refId: input.checkoutRef,
      idempotencyKey: `onchain:market:${input.checkoutRef}:${input.merchantId}`,
    });

    return { txHash: hash };
  } catch (err) {
    if (required) throw err;
    return null;
  }
}
