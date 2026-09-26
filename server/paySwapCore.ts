import { FieldValue } from "firebase-admin/firestore";
import { formatUnits, type Hash } from "viem";
import { adminDb } from "./firebaseAdmin.js";
import { applyProtocolFee } from "./protocolCore.js";
import { getTokenPricesConfig } from "./platformProgramsCore.js";
import {
  depositTreasuryAddress,
  isPayHubWithdrawConfigured,
  sendGatOnSidra,
  sendNativeSdaOnSidra,
  sidraPublicClient,
  verifyGatDepositTransfer,
  getPayLedger,
} from "./payLedgerCore.js";
import { shouldReadChainBalance } from "./payHubLedgerMode.js";
import { shouldMutateFirestorePayLedger } from "./payHubOnChainWrite.js";

const PAY_LEDGER = "pay_ledgers";
const SWAP_COL = "pay_swaps";

export type SwapSymbol = "GAT" | "SDA";

export type PayHubSwapResult = {
  ok: true;
  from: SwapSymbol;
  to: SwapSymbol;
  fromAmount: number;
  grossToAmount: number;
  feeAmount: number;
  netToAmount: number;
  gatBalance: number;
  sdaBalance: number;
  /** Where the swapped token was delivered. */
  delivery: "pay_hub" | "wallet";
  outboundTxHash?: string;
  txHash?: string;
};

export type OnChainSwapResult = PayHubSwapResult & {
  inboundTxHash: string;
  outboundTxHash: string;
};

const swapRate = (from: SwapSymbol, to: SwapSymbol, prices: Record<string, number>): number => {
  if (from === to) return 1;
  const fromPrice = prices[from] ?? 0;
  const toPrice = prices[to] ?? 0;
  if (fromPrice > 0 && toPrice > 0) return fromPrice / toPrice;
  if (from === "GAT" && to === "SDA") return 1;
  if (from === "SDA" && to === "GAT") return 1;
  return 0;
};

async function readLedgerBalances(uid: string) {
  if (shouldReadChainBalance()) {
    const ledger = await getPayLedger(uid);
    return {
      gatBalance: ledger.ledgerGat ?? ledger.gatBalance,
      sdaBalance: ledger.sdaBalance,
    };
  }
  const snap = await adminDb().collection(PAY_LEDGER).doc(uid).get();
  return {
    gatBalance: snap.exists ? Number(snap.data()?.gatBalance ?? 0) : 0,
    sdaBalance: snap.exists ? Number(snap.data()?.sdaBalance ?? 0) : 0,
  };
}

const roundAmount = (value: number) => Math.round(value * 1e8) / 1e8;

export async function swapPayHubLedger(
  uid: string,
  from: SwapSymbol,
  to: SwapSymbol,
  fromAmount: number,
  walletAddress?: string,
): Promise<PayHubSwapResult> {
  if (from === to) throw new Error("Invalid swap pair");
  if (!Number.isFinite(fromAmount) || fromAmount <= 0) throw new Error("Invalid swap amount");
  if (from === "SDA") {
    throw new Error("SDA Pay Hub balance is disabled, swap SDA from your wallet on-chain");
  }

  const normalizedWallet = walletAddress?.trim().toLowerCase();
  const walletReady = Boolean(normalizedWallet?.match(/^0x[a-f0-9]{40}$/));

  const { prices } = await getTokenPricesConfig();
  const rate = swapRate(from, to, prices);
  if (!rate) throw new Error("Swap rate unavailable");

  const grossToAmount = roundAmount(fromAmount * rate);
  const feeResult = await applyProtocolFee({
    uid,
    feeType: "swap",
    grossAmount: grossToAmount,
    refId: `swap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    channel: "pay_hub",
  });

  const netToAmount = roundAmount(feeResult.netAmount);
  if (netToAmount <= 0) throw new Error("Swap amount too small after fees");

  const deliverSdaToWallet =
    to === "SDA"
    && walletReady
    && isPayHubWithdrawConfigured();

  if (to === "SDA" && !deliverSdaToWallet) {
    throw new Error("Connect wallet to receive SDA, Pay Hub SDA balance is disabled");
  }

  if (!shouldMutateFirestorePayLedger("protocol")) {
    const balances = await readLedgerBalances(uid);
    if (from === "GAT" && balances.gatBalance < fromAmount) {
      throw new Error("Insufficient GAT balance in Pay Hub");
    }
  } else {
    const db = adminDb();
    const ref = db.collection(PAY_LEDGER).doc(uid);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const gat = snap.exists ? Number(snap.data()?.gatBalance ?? 0) : 0;
      const sda = snap.exists ? Number(snap.data()?.sdaBalance ?? 0) : 0;

      if (from === "GAT" && gat < fromAmount) throw new Error("Insufficient GAT balance in Pay Hub");

      const nextGat = from === "GAT"
        ? roundAmount(gat - fromAmount)
        : roundAmount(gat + netToAmount);
      const nextSda = sda;

      tx.set(ref, {
        uid,
        gatBalance: nextGat,
        sdaBalance: nextSda,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  }

  let outboundTxHash: string | undefined;
  let delivery: "pay_hub" | "wallet" = "pay_hub";

  if (deliverSdaToWallet && normalizedWallet) {
    try {
      outboundTxHash = await sendNativeSdaOnSidra(normalizedWallet, netToAmount);
      delivery = "wallet";
    } catch (err) {
      if (shouldMutateFirestorePayLedger("protocol")) {
        const db = adminDb();
        const ref = db.collection(PAY_LEDGER).doc(uid);
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const gat = snap.exists ? Number(snap.data()?.gatBalance ?? 0) : 0;
          tx.set(ref, {
            uid,
            gatBalance: roundAmount(gat + fromAmount),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        });
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  const ledger = await getPayLedger(uid);

  await db.collection(SWAP_COL).add({
    uid,
    mode: "pay_hub",
    from,
    to,
    fromAmount,
    grossToAmount,
    feeAmount: feeResult.feeAmount,
    netToAmount,
    delivery,
    outboundTxHash: outboundTxHash ?? null,
    walletAddress: normalizedWallet ?? null,
    gatBalance: ledger.gatBalance,
    sdaBalance: ledger.sdaBalance,
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    from,
    to,
    fromAmount,
    grossToAmount,
    feeAmount: feeResult.feeAmount,
    netToAmount,
    gatBalance: ledger.gatBalance,
    sdaBalance: ledger.sdaBalance,
    delivery,
    outboundTxHash,
    txHash: outboundTxHash,
  };
}

export async function verifyNativeSdaToTreasury(
  txHash: string,
  walletAddress: string,
): Promise<{ amountSda: number }> {
  const treasury = depositTreasuryAddress();
  if (!treasury) throw new Error("Treasury not configured");

  const hash = txHash.trim() as Hash;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Invalid transaction hash");

  const publicClient = sidraPublicClient();
  const [receipt, tx] = await Promise.all([
    publicClient.getTransactionReceipt({ hash }).catch(() => null),
    publicClient.getTransaction({ hash }).catch(() => null),
  ]);

  if (!receipt || receipt.status !== "success" || !tx) {
    throw new Error("Transaction not found or failed");
  }

  const from = walletAddress.toLowerCase();
  if (tx.from.toLowerCase() !== from) throw new Error("Transaction sender mismatch");
  if ((tx.to ?? "").toLowerCase() !== treasury) {
    throw new Error("No SDA transfer to treasury found in this transaction");
  }

  const amountSda = Number(formatUnits(tx.value, 18));
  if (!Number.isFinite(amountSda) || amountSda <= 0) {
    throw new Error("Invalid SDA transfer amount");
  }

  return { amountSda };
}

export async function confirmOnChainSwap(
  uid: string,
  walletAddress: string,
  txHash: string,
  from: SwapSymbol,
  to: SwapSymbol,
): Promise<OnChainSwapResult> {
  if (!isPayHubWithdrawConfigured()) {
    throw new Error("On-chain swap not configured on server");
  }
  if (from === to) throw new Error("Invalid swap pair");

  const normalizedHash = txHash.trim().toLowerCase();
  const dup = await adminDb().collection(SWAP_COL).where("inboundTxHash", "==", normalizedHash).limit(1).get();
  if (!dup.empty) throw new Error("Swap already processed");

  const inbound = from === "GAT"
    ? await verifyGatDepositTransfer(txHash, walletAddress)
    : await verifyNativeSdaToTreasury(txHash, walletAddress);

  const fromAmount = from === "GAT"
    ? (inbound as { amountGat: number }).amountGat
    : (inbound as { amountSda: number }).amountSda;

  const { prices } = await getTokenPricesConfig();
  const rate = swapRate(from, to, prices);
  if (!rate) throw new Error("Swap rate unavailable");

  const grossToAmount = fromAmount * rate;
  const feeResult = await applyProtocolFee({
    uid,
    feeType: "swap",
    grossAmount: grossToAmount,
    refId: normalizedHash,
    channel: "onchain_swap",
  });

  const outboundTxHash = to === "GAT"
    ? await sendGatOnSidra(walletAddress, feeResult.netAmount)
    : await sendNativeSdaOnSidra(walletAddress, feeResult.netAmount);

  const balances = await readLedgerBalances(uid);

  await adminDb().collection(SWAP_COL).add({
    uid,
    mode: "onchain",
    from,
    to,
    fromAmount,
    grossToAmount,
    feeAmount: feeResult.feeAmount,
    netToAmount: feeResult.netAmount,
    inboundTxHash: normalizedHash,
    outboundTxHash,
    walletAddress: walletAddress.toLowerCase(),
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    from,
    to,
    fromAmount,
    grossToAmount,
    feeAmount: feeResult.feeAmount,
    netToAmount: feeResult.netAmount,
    gatBalance: balances.gatBalance,
    sdaBalance: balances.sdaBalance,
    delivery: "wallet",
    outboundTxHash,
    txHash: outboundTxHash,
    inboundTxHash: normalizedHash,
  };
}

export const paySwapErrorStatus = (message: string): number => {
  if (message === "Unauthorized") return 401;
  if (
    message.startsWith("Invalid")
    || message.startsWith("Insufficient")
    || message.includes("not configured")
    || message.includes("unavailable")
    || message.includes("already processed")
    || message.includes("not found")
    || message.includes("mismatch")
  ) {
    return 400;
  }
  return 500;
};
