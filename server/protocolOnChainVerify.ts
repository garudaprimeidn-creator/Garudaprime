import {
  createPublicClient,
  decodeEventLog,
  formatUnits,
  http,
  type Address,
  type Hash,
} from "viem";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import { resolveUidFromWalletAddress } from "./walletIdentityCore.js";

const SETTLEMENTS_COL = "protocol_settlements";

const sidraRpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
const sidraChainId = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;

const INVESTED_EVENT_ABI = [
  {
    type: "event",
    name: "Invested",
    inputs: [
      { indexed: true, name: "positionId", type: "uint256" },
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "fundId", type: "uint256" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "fee", type: "uint256" },
    ],
  },
] as const;

const STAKED_EVENT_ABI = [
  {
    type: "event",
    name: "Staked",
    inputs: [
      { indexed: true, name: "stakeId", type: "uint256" },
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "lockUntil", type: "uint256" },
      { indexed: false, name: "fee", type: "uint256" },
    ],
  },
] as const;

function publicClient() {
  return createPublicClient({
    chain: {
      id: sidraChainId,
      name: "Sidra",
      nativeCurrency: { name: "SDA", symbol: "SDA", decimals: 18 },
      rpcUrls: { default: { http: [sidraRpc] } },
    },
    transport: http(sidraRpc),
  });
}

function gatDecimals(): number {
  const n = Number(process.env.VITE_GAT_TOKEN_DECIMALS ?? 18);
  return Number.isFinite(n) && n > 0 ? n : 18;
}

function investmentVaultAddress(): Address | null {
  const raw =
    process.env.VITE_GAT_INVESTMENT_VAULT_ADDRESS?.trim() ||
    process.env.GAT_INVESTMENT_VAULT_ADDRESS?.trim();
  return raw?.startsWith("0x") ? (raw as Address) : null;
}

function stakingPoolAddress(): Address | null {
  const raw =
    process.env.VITE_GAT_STAKING_POOL_ADDRESS?.trim() ||
    process.env.GAT_STAKING_POOL_ADDRESS?.trim();
  return raw?.startsWith("0x") ? (raw as Address) : null;
}

function normalizeTxHash(txHash: string): Hash {
  const hash = txHash.trim() as Hash;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error("Invalid transaction hash");
  }
  return hash;
}

function normalizeWallet(walletAddress: string): string {
  const wallet = walletAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
    throw new Error("Invalid wallet address");
  }
  return wallet;
}

async function assertWalletOwnedByUid(uid: string, walletAddress: string) {
  const ownerUid = await resolveUidFromWalletAddress(walletAddress);
  if (!ownerUid || ownerUid !== uid) {
    throw new Error("Wallet does not belong to this account");
  }
}

async function assertTxHashUnused(txHash: string) {
  const normalized = txHash.trim().toLowerCase();
  const dup = await adminDb()
    .collection(SETTLEMENTS_COL)
    .where("txHash", "==", normalized)
    .limit(1)
    .get();
  if (!dup.empty) throw new Error("Transaction already verified");
}

async function recordOnChainSettlement(input: {
  refId: string;
  uid: string;
  action: "invest_deposit" | "stake";
  grossAmountGat: number;
  fundId?: number;
  txHash: string;
  walletAddress: string;
  onChainId: number;
}) {
  const db = adminDb();
  const ref = db.collection(SETTLEMENTS_COL).doc(input.refId);
  const normalizedTx = input.txHash.trim().toLowerCase();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = snap.data()!;
      if (data.source === "onchain" && data.txHash === normalizedTx) return;
      throw new Error("Duplicate refId");
    }

    tx.set(ref, {
      uid: input.uid,
      action: input.action,
      grossAmountGat: input.grossAmountGat,
      fundId: input.fundId ?? null,
      source: "onchain",
      channel: "onchain",
      txHash: normalizedTx,
      walletAddress: input.walletAddress.toLowerCase(),
      onChainPositionId: input.action === "invest_deposit" ? input.onChainId : null,
      onChainStakeId: input.action === "stake" ? input.onChainId : null,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

export type VerifiedInvestTx = {
  positionId: number;
  fundId: number;
  amountGat: number;
  feeGat: number;
  user: string;
  txHash: string;
};

export type VerifiedStakeTx = {
  stakeId: number;
  amountGat: number;
  feeGat: number;
  user: string;
  lockUntil: number;
  txHash: string;
};

async function parseInvestedEvent(
  txHash: string,
  walletAddress: string,
  fundId: number,
  positionId?: number,
): Promise<VerifiedInvestTx> {
  const vault = investmentVaultAddress();
  if (!vault) throw new Error("Investment vault not configured on server");

  const hash = normalizeTxHash(txHash);
  const wallet = normalizeWallet(walletAddress);
  const client = publicClient();
  const receipt = await client.getTransactionReceipt({ hash }).catch(() => null);
  if (!receipt || receipt.status !== "success") {
    throw new Error("Transaction not found or failed");
  }

  const vaultLc = vault.toLowerCase();
  let matched: VerifiedInvestTx | null = null;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== vaultLc) continue;
    try {
      const decoded = decodeEventLog({
        abi: INVESTED_EVENT_ABI,
        eventName: "Invested",
        data: log.data,
        topics: log.topics,
      });
      const args = decoded.args;
      const eventFundId = Number(args.fundId);
      const eventPositionId = Number(args.positionId);
      const eventUser = String(args.user).toLowerCase();
      const amountGat = Number(formatUnits(args.amount, gatDecimals()));
      const feeGat = Number(formatUnits(args.fee, gatDecimals()));

      if (eventUser !== wallet) continue;
      if (eventFundId !== fundId) continue;
      if (positionId != null && eventPositionId !== positionId) continue;
      if (!Number.isFinite(amountGat) || amountGat <= 0) continue;

      matched = {
        positionId: eventPositionId,
        fundId: eventFundId,
        amountGat,
        feeGat,
        user: eventUser,
        txHash: hash,
      };
      break;
    } catch {
      /* skip */
    }
  }

  if (!matched) throw new Error("Invested event not found in transaction");
  return matched;
}

async function parseStakedEvent(
  txHash: string,
  walletAddress: string,
  stakeId?: number,
): Promise<VerifiedStakeTx> {
  const pool = stakingPoolAddress();
  if (!pool) throw new Error("Staking pool not configured on server");

  const hash = normalizeTxHash(txHash);
  const wallet = normalizeWallet(walletAddress);
  const client = publicClient();
  const receipt = await client.getTransactionReceipt({ hash }).catch(() => null);
  if (!receipt || receipt.status !== "success") {
    throw new Error("Transaction not found or failed");
  }

  const poolLc = pool.toLowerCase();
  let matched: VerifiedStakeTx | null = null;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== poolLc) continue;
    try {
      const decoded = decodeEventLog({
        abi: STAKED_EVENT_ABI,
        eventName: "Staked",
        data: log.data,
        topics: log.topics,
      });
      const args = decoded.args;
      const eventStakeId = Number(args.stakeId);
      const eventUser = String(args.user).toLowerCase();
      const amountGat = Number(formatUnits(args.amount, gatDecimals()));
      const feeGat = Number(formatUnits(args.fee, gatDecimals()));
      const lockUntil = Number(args.lockUntil);

      if (eventUser !== wallet) continue;
      if (stakeId != null && eventStakeId !== stakeId) continue;
      if (!Number.isFinite(amountGat) || amountGat <= 0) continue;

      matched = {
        stakeId: eventStakeId,
        amountGat,
        feeGat,
        user: eventUser,
        lockUntil,
        txHash: hash,
      };
      break;
    } catch {
      /* skip */
    }
  }

  if (!matched) throw new Error("Staked event not found in transaction");
  return matched;
}

export async function verifyAndRecordOnChainInvest(input: {
  uid: string;
  refId: string;
  txHash: string;
  walletAddress: string;
  fundId: number;
  positionId?: number;
}) {
  const refId = String(input.refId ?? "").trim();
  if (!refId) throw new Error("Missing refId");

  await assertWalletOwnedByUid(input.uid, input.walletAddress);
  await assertTxHashUnused(input.txHash);

  const verified = await parseInvestedEvent(
    input.txHash,
    input.walletAddress,
    input.fundId,
    input.positionId,
  );

  await recordOnChainSettlement({
    refId,
    uid: input.uid,
    action: "invest_deposit",
    grossAmountGat: verified.amountGat,
    fundId: verified.fundId,
    txHash: verified.txHash,
    walletAddress: verified.user,
    onChainId: verified.positionId,
  });

  return {
    ok: true as const,
    action: "invest_deposit" as const,
    refId,
    fundId: verified.fundId,
    positionId: verified.positionId,
    amountGat: verified.amountGat,
    feeGat: verified.feeGat,
    txHash: verified.txHash,
    source: "onchain" as const,
  };
}

export async function verifyAndRecordOnChainStake(input: {
  uid: string;
  refId: string;
  txHash: string;
  walletAddress: string;
  stakeId?: number;
}) {
  const refId = String(input.refId ?? "").trim();
  if (!refId) throw new Error("Missing refId");

  await assertWalletOwnedByUid(input.uid, input.walletAddress);
  await assertTxHashUnused(input.txHash);

  const verified = await parseStakedEvent(
    input.txHash,
    input.walletAddress,
    input.stakeId,
  );

  await recordOnChainSettlement({
    refId,
    uid: input.uid,
    action: "stake",
    grossAmountGat: verified.amountGat,
    txHash: verified.txHash,
    walletAddress: verified.user,
    onChainId: verified.stakeId,
  });

  return {
    ok: true as const,
    action: "stake" as const,
    refId,
    stakeId: verified.stakeId,
    amountGat: verified.amountGat,
    feeGat: verified.feeGat,
    lockUntil: verified.lockUntil,
    txHash: verified.txHash,
    source: "onchain" as const,
  };
}

export async function assertOnChainInvestmentSettlement(
  uid: string,
  refId: string,
  fundId: number,
  amountGat: number,
  txHash?: string,
) {
  const snap = await adminDb().collection(SETTLEMENTS_COL).doc(refId).get();
  if (!snap.exists) throw new Error("Settlement not found");
  const data = snap.data()!;
  if (data.uid !== uid) throw new Error("Settlement mismatch");
  if (data.action !== "invest_deposit") throw new Error("Invalid settlement action");
  if (data.source !== "onchain") throw new Error("Not an on-chain settlement");
  if (Number(data.fundId) !== fundId) throw new Error("Fund mismatch");
  if (Math.abs(Number(data.grossAmountGat) - amountGat) > 0.05) {
    throw new Error("Amount mismatch");
  }
  if (txHash) {
    const normalized = txHash.trim().toLowerCase();
    if (String(data.txHash ?? "").toLowerCase() !== normalized) {
      throw new Error("Tx hash mismatch");
    }
  }
}
