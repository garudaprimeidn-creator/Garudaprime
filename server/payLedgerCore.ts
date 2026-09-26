import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  formatUnits,
  http,
  parseUnits,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import { getMerchantPoolBalanceForOwner } from "./merchantLedgerCore.js";
import { applyProtocolFee, creditLedger, deductLedger } from "./protocolCore.js";
import { recordPayHubDepositHistory } from "./payUserHistoryCore.js";
import { relayerWithdrawGat } from "./payRelayerCore.js";
import { getEmbeddedGatBalanceForUid } from "./chainBalanceService.js";
import { isOnChainLedgerPrimary, shouldReadChainBalance } from "./payHubLedgerMode.js";
import { isFirestoreLedgerDeprecated } from "./payHubOnChainWrite.js";
import { getPayHubGatAllowance } from "./payHubApprovalCore.js";
import { isOnChainWritePrimaryFor } from "./payHubOnChainWrite.js";
import { assertOnChainPayHubSpendable } from "./payHubOnChainBalance.js";
import { relayWithdrawFromEmbedded } from "./onChainPayHubAdapter.js";
import { resolvePrimaryWalletForUid } from "./chainBalanceService.js";

const PAY_LEDGER = "pay_ledgers";
const WITHDRAWALS_COL = "pay_withdrawals";
const DEPOSITS_COL = "pay_deposits";

const ERC20_ABI = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const sidraRpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
const sidraChain = defineChain({
  id: Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453,
  name: "Sidra",
  nativeCurrency: { name: "SDA", symbol: "SDA", decimals: 18 },
  rpcUrls: { default: { http: [sidraRpc] } },
});

const MIN_WITHDRAW_GAT = 1;
const MIN_DEPOSIT_GAT = 1;

function sidraPublicClient() {
  return createPublicClient({
    chain: sidraChain,
    transport: http(sidraRpc),
  });
}

function gatTokenAddress(): string | null {
  const raw = process.env.VITE_GAT_TOKEN_ADDRESS?.trim() || process.env.GAT_TOKEN_ADDRESS?.trim();
  return raw?.startsWith("0x") ? raw : null;
}

function treasuryPrivateKey(): string | null {
  const key =
    process.env.PROTOCOL_OWNER_PRIVATE_KEY?.trim()
    || process.env.DEPLOYER_PRIVATE_KEY?.trim();
  return key?.startsWith("0x") ? key : null;
}

function gatDecimals(): number {
  const n = Number(process.env.VITE_GAT_TOKEN_DECIMALS ?? 18);
  return Number.isFinite(n) && n > 0 ? n : 18;
}

export function isPayHubWithdrawConfigured(): boolean {
  return Boolean(gatTokenAddress() && treasuryPrivateKey());
}

/** Pay Hub backing (EOA), not GATProtocolTreasury SC. See docs/adr/001. */
function depositTreasuryAddress(): string | null {
  const backingCandidates = [
    process.env.VITE_PAY_HUB_BACKING_ADDRESS,
    process.env.PAY_HUB_BACKING_ADDRESS,
    process.env.PROTOCOL_OWNER_ADDRESS,
  ];
  for (const raw of backingCandidates) {
    const v = raw?.trim();
    if (v?.startsWith("0x")) return v.toLowerCase();
  }
  const key = treasuryPrivateKey();
  if (!key) return null;
  return privateKeyToAccount(key as Hex).address.toLowerCase();
}

export function isPayHubDepositConfigured(): boolean {
  return Boolean(gatTokenAddress() && depositTreasuryAddress());
}

/** Align Firestore pay ledger with on-chain GAT (best-effort after on-chain settlement). */
export async function syncPayLedgerGatFromChain(uid: string): Promise<void> {
  if (!shouldReadChainBalance()) return;
  try {
    const embedded = await getEmbeddedGatBalanceForUid(uid);
    if (!embedded.walletAddress) return;
    await adminDb().collection(PAY_LEDGER).doc(uid).set(
      {
        gatBalance: embedded.gatBalance,
        onChainWallet: embedded.walletAddress.toLowerCase(),
        lastChainSyncAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch {
    /* best-effort */
  }
}

export async function getPayLedger(uid: string) {
  const snap = await adminDb().collection(PAY_LEDGER).doc(uid).get();
  const data = snap.data();
  const depositAddress = depositTreasuryAddress();
  const fsLedgerGat = snap.exists ? Number(data?.gatBalance ?? 0) : 0;
  const merchantPool = await getMerchantPoolBalanceForOwner(uid);
  const onChainPrimary = isOnChainLedgerPrimary();

  let ledgerGat = fsLedgerGat;
  let onChainWallet: string | null = null;
  let onChainGat = 0;
  let payHubApprovalSufficient = false;

  if (shouldReadChainBalance()) {
    const onChain = await getEmbeddedGatBalanceForUid(uid);
    onChainWallet = onChain.walletAddress;
    onChainGat = onChain.gatBalance;
    ledgerGat = onChainPrimary
      ? onChainGat
      : Math.max(fsLedgerGat, onChainGat);

    if (onChainWallet) {
      const allowance = await getPayHubGatAllowance(onChainWallet).catch(() => null);
      payHubApprovalSufficient = Boolean(allowance?.sufficient);
    }
  }

  const spendableGat = onChainPrimary ? onChainGat : ledgerGat + merchantPool;

  return {
    gatBalance: spendableGat,
    ledgerGat,
    merchantPoolGat: merchantPool,
    onChainWallet,
    onChainGat,
    fsLedgerGat,
    payHubApprovalSufficient,
    fsLedgerDeprecated: isFirestoreLedgerDeprecated(),
    sdaBalance: 0,
    withdrawEnabled: isPayHubWithdrawConfigured(),
    depositEnabled: isPayHubDepositConfigured(),
    depositAddress: depositAddress ?? null,
    minWithdrawGat: MIN_WITHDRAW_GAT,
    minDepositGat: MIN_DEPOSIT_GAT,
    swapEnabled: true,
  };
}

async function sendGatOnSidra(to: string, amountGat: number): Promise<Hash> {
  const token = gatTokenAddress();
  const key = treasuryPrivateKey();
  if (!token || !key) throw new Error("On-chain withdraw not configured");

  const account = privateKeyToAccount(key as Hex);
  const wallet = createWalletClient({
    account,
    chain: sidraChain,
    transport: http(sidraRpc),
  });
  const publicClient = sidraPublicClient();

  const amountStr = amountGat.toLocaleString("en-US", {
    maximumFractionDigits: 6,
    useGrouping: false,
  });
  const value = parseUnits(amountStr, gatDecimals());
  if (value <= 0n) throw new Error("Invalid withdraw amount");

  const hash = await wallet.writeContract({
    chain: sidraChain,
    account,
    address: token as Hex,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [to as Hex, value],
  });

  await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  return hash;
}

export async function sendNativeSdaOnSidra(to: string, amountSda: number): Promise<Hash> {
  const key = treasuryPrivateKey();
  if (!key) throw new Error("On-chain SDA transfer not configured");

  const account = privateKeyToAccount(key as Hex);
  const publicClient = sidraPublicClient();

  const amountStr = amountSda.toLocaleString("en-US", {
    maximumFractionDigits: 8,
    useGrouping: false,
  });
  const value = parseUnits(amountStr, 18);
  if (value <= 0n) throw new Error("Invalid SDA amount");

  const gasPrice = await publicClient.getGasPrice();
  const nonce = await publicClient.getTransactionCount({ address: account.address });
  const gas = await publicClient.estimateGas({
    account: account.address,
    to: to as Hex,
    value,
  });

  const serialized = await account.signTransaction({
    chainId: sidraChain.id,
    nonce,
    gas,
    gasPrice,
    to: to as Hex,
    value,
    type: "legacy",
  });
  const hash = await publicClient.sendRawTransaction({ serializedTransaction: serialized });

  await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  return hash;
}

const MIN_WITHDRAW_SDA = 0.0001;

export async function withdrawPayHubSda(
  _uid: string,
  _walletAddress: string,
  _amountSda: number,
) {
  throw new Error("Pay Hub SDA balance is disabled, use on-chain wallet for SDA");
}

export async function withdrawPayHubGat(
  uid: string,
  walletAddress: string,
  amountGat: number,
) {
  if (!walletAddress?.startsWith("0x") || walletAddress.length !== 42) {
    throw new Error("Invalid wallet address");
  }
  if (!Number.isFinite(amountGat) || amountGat < MIN_WITHDRAW_GAT) {
    throw new Error(`Minimum withdraw is ${MIN_WITHDRAW_GAT} GAT`);
  }
  if (!isPayHubWithdrawConfigured()) {
    throw new Error("Withdraw to wallet is not configured on server");
  }

  const ledger = await getPayLedger(uid);
  if (ledger.gatBalance < amountGat) {
    throw new Error("Insufficient Pay Hub GAT balance");
  }

  const chainWithdraw = isOnChainWritePrimaryFor("withdraw");
  const refId = `withdraw:${uid}:${walletAddress.toLowerCase()}:${amountGat}`;

  if (chainWithdraw) {
    await assertOnChainPayHubSpendable(uid, amountGat);
  } else {
    await deductLedger(uid, amountGat, "withdraw");
  }

  try {
    const idempotencyKey = refId;
    let txHash: Hash;
    let jobId: string;

    if (chainWithdraw) {
      const relay = await relayWithdrawFromEmbedded({
        uid,
        toAddress: walletAddress,
        amountGat,
        refId,
      });
      if (!relay?.txHash) throw new Error("On-chain withdraw failed");
      txHash = relay.txHash as Hash;
      jobId = refId;
    } else {
      const result = await relayerWithdrawGat({
        uid,
        toAddress: walletAddress,
        amountGat,
        initiatedBy: "user",
        idempotencyKey,
      });
      txHash = result.txHash;
      jobId = result.jobId;
    }
    await adminDb().collection(WITHDRAWALS_COL).add({
      uid,
      walletAddress: walletAddress.toLowerCase(),
      amountGat,
      txHash,
      relayerJobId: jobId,
      status: "confirmed",
      initiatedBy: "user",
      createdAt: FieldValue.serverTimestamp(),
    });
    return { ok: true as const, amountGat, txHash, gatBalance: ledger.gatBalance - amountGat };
  } catch (err) {
    if (!chainWithdraw) {
      await creditLedger(uid, amountGat, "withdraw");
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

async function verifyGatDepositTransfer(
  txHash: string,
  walletAddress: string,
): Promise<{ amountGat: number }> {
  const token = gatTokenAddress();
  const treasury = depositTreasuryAddress();
  if (!token || !treasury) throw new Error("Deposit to Pay Hub is not configured on server");

  const hash = txHash.trim() as Hash;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Invalid transaction hash");

  const publicClient = sidraPublicClient();
  const receipt = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
  if (!receipt || receipt.status !== "success") {
    throw new Error("Transaction not found or failed");
  }

  const from = walletAddress.toLowerCase();
  const tokenLc = token.toLowerCase();
  const treasuryLc = treasury.toLowerCase();

  let matched: bigint | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== tokenLc) continue;
    try {
      const decoded = decodeEventLog({
        abi: ERC20_ABI,
        eventName: "Transfer",
        data: log.data,
        topics: log.topics,
      });
      const args = decoded.args;
      if (args.from.toLowerCase() === from && args.to.toLowerCase() === treasuryLc) {
        matched = args.value;
        break;
      }
    } catch {
      /* skip non-transfer logs */
    }
  }

  if (matched === null || matched <= 0n) {
    throw new Error("No GAT transfer to treasury found in this transaction");
  }

  const amountGat = Number(formatUnits(matched, gatDecimals()));
  if (!Number.isFinite(amountGat) || amountGat < MIN_DEPOSIT_GAT) {
    throw new Error(`Minimum deposit is ${MIN_DEPOSIT_GAT} GAT`);
  }

  return { amountGat };
}

export async function depositPayHubGat(
  uid: string,
  walletAddress: string,
  txHash: string,
) {
  if (!walletAddress?.startsWith("0x") || walletAddress.length !== 42) {
    throw new Error("Invalid wallet address");
  }
  if (!isPayHubDepositConfigured()) {
    throw new Error("Deposit to Pay Hub is not configured on server");
  }

  const normalizedHash = txHash.trim().toLowerCase();
  const db = adminDb();

  const dup = await db.collection(DEPOSITS_COL).where("txHash", "==", normalizedHash).limit(1).get();
  if (!dup.empty) throw new Error("Deposit already processed");

  const { amountGat: grossAmount } = await verifyGatDepositTransfer(txHash, walletAddress);

  const feeResult = await applyProtocolFee({
    uid,
    feeType: "deposit",
    grossAmount,
    refId: normalizedHash,
    channel: "onchain_deposit",
  });

  const chainDeposit = isOnChainWritePrimaryFor("deposit");
  if (chainDeposit) {
    const embedded = await resolvePrimaryWalletForUid(uid);
    if (!embedded) throw new Error("Garuda Wallet not linked, connect wallet before deposit");
    await sendGatOnSidra(embedded, feeResult.netAmount);
  } else {
    await creditLedger(uid, feeResult.netAmount, "deposit");
  }

  const ledger = await getPayLedger(uid);

  await db.collection(DEPOSITS_COL).add({
    uid,
    walletAddress: walletAddress.toLowerCase(),
    txHash: normalizedHash,
    grossAmountGat: grossAmount,
    feeAmountGat: feeResult.feeAmount,
    netAmountGat: feeResult.netAmount,
    ledgerCreditAmount: feeResult.netAmount,
    feeBps: feeResult.feeBps,
    status: "confirmed",
    createdAt: FieldValue.serverTimestamp(),
  });

  await recordPayHubDepositHistory({
    uid,
    netAmountGat: feeResult.netAmount,
    txHash: normalizedHash,
  }).catch(() => undefined);

  return {
    ok: true as const,
    grossAmountGat: grossAmount,
    feeAmountGat: feeResult.feeAmount,
    netAmountGat: feeResult.netAmount,
    txHash: normalizedHash,
    gatBalance: ledger.gatBalance,
  };
}

export {
  sidraChain,
  sidraPublicClient,
  depositTreasuryAddress,
  gatDecimals,
  gatTokenAddress,
  sendGatOnSidra,
  verifyGatDepositTransfer,
};

export const payLedgerErrorStatus = (message: string): number => {
  if (message === "Unauthorized") return 401;
  if (
    message.startsWith("Invalid")
    || message.startsWith("Insufficient")
    || message.startsWith("Minimum")
    || message.includes("not configured")
    || message.includes("already processed")
    || message.includes("No GAT transfer")
    || message.includes("Transaction not found")
  ) {
    return 400;
  }
  return 500;
};
