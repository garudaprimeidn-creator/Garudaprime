/**
 * Garuda Native Wallet, server-side transaction signing + broadcast.
 */
import {
  createWalletClient,
  http,
  isAddress,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  assertGarudaWalletOwner,
  derivedGarudaWalletAddress,
  deriveGarudaAccountForUid,
  isGarudaNativeWalletEnabled,
  logGarudaSignEvent,
} from "./garudaWalletCore.js";
import { adminDb } from "./firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";
import { isFirestoreQuotaError } from "./firestoreQuota.js";
import {
  ensureGarudaWalletGas,
  GARUDA_GAS_USER_MESSAGE,
  isInsufficientGasError,
} from "./garudaWalletGasSponsor.js";
import {
  broadcastGarudaTransaction,
  parseHexValue,
  garudaSidraChain,
  garudaSidraRpc,
} from "./garudaTxBroadcast.js";

const sidraRpc = garudaSidraRpc;
const chain = garudaSidraChain;

function allowedContractAddresses(): Set<string> {
  const keys = [
    "VITE_GAT_TOKEN_ADDRESS",
    "GAT_TOKEN_ADDRESS",
    "VITE_PAY_HUB_ONCHAIN_PAYMENT",
    "PAY_HUB_ONCHAIN_PAYMENT",
    "VITE_GAT_STAKING_POOL_ADDRESS",
    "VITE_GAT_INVESTMENT_VAULT_ADDRESS",
    "VITE_GAT_FEE_ROUTER_ADDRESS",
    "VITE_GAT_TREASURY_ADDRESS",
  ];
  const contracts = new Set<string>();
  for (const key of keys) {
    const v = process.env[key]?.trim().toLowerCase();
    if (v?.startsWith("0x")) contracts.add(v);
  }
  try {
    const json = process.env.PAY_HUB_ONCHAIN_CONTRACTS_JSON?.trim();
    if (json) {
      const parsed = JSON.parse(json) as Record<string, string>;
      for (const key of ["payment", "merchant", "marketplace", "reward", "validator", "governance", "gatToken"]) {
        const v = parsed[key]?.trim().toLowerCase();
        if (v?.startsWith("0x")) contracts.add(v);
      }
      for (const v of Object.values(parsed)) {
        if (typeof v === "string" && v.startsWith("0x")) contracts.add(v.toLowerCase());
      }
    }
  } catch {
    /* ignore */
  }
  return contracts;
}

type TxParams = {
  from?: string;
  to?: string;
  data?: string;
  value?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
  chainId?: string;
};

function validateTransactionParams(uid: string, from: string, tx: TxParams): void {
  const fromNorm = from.toLowerCase();
  if (tx.from && tx.from.toLowerCase() !== fromNorm) {
    throw new Error("Transaction from address mismatch");
  }
  if (!tx.to || !isAddress(tx.to)) {
    throw new Error("Invalid transaction to address");
  }
  const to = tx.to.toLowerCase();
  const allowed = allowedContractAddresses();
  const isContractCall = Boolean(tx.data && tx.data !== "0x" && tx.data.length > 2);
  if (isContractCall && allowed.size > 0 && !allowed.has(to)) {
    throw new Error("Contract not in Garuda wallet allowlist");
  }
  const value = parseHexValue(tx.value);
  const maxNative = parseHexValue(process.env.GARUDA_WALLET_MAX_NATIVE_WEI ?? "0");
  if (maxNative > 0n && value > maxNative) {
    throw new Error("Transaction value exceeds limit");
  }
  void uid;
}

export async function signAndBroadcastGarudaTransaction(input: {
  uid: string;
  address: string;
  transaction: TxParams;
}): Promise<{ txHash: Hash; pending?: boolean }> {
  if (!isGarudaNativeWalletEnabled()) {
    throw new Error("Garuda native wallet not enabled");
  }

  await assertGarudaWalletOwner(input.uid, input.address);
  const owner = derivedGarudaWalletAddress(input.uid);
  const txParams = { ...input.transaction, from: owner };
  validateTransactionParams(input.uid, owner, txParams);

  const account = deriveGarudaAccountForUid(input.uid);
  if (account.address.toLowerCase() !== owner) {
    throw new Error("Derived wallet mismatch, contact support");
  }

  const walletClient = createWalletClient({
    account,
    chain: chain(),
    transport: http(sidraRpc),
  });

  const broadcastInput = {
    account,
    to: txParams.to as Hex,
    data: (txParams.data as Hex | undefined) ?? undefined,
    value: parseHexValue(txParams.value),
    gas: txParams.gas ? BigInt(txParams.gas) : undefined,
    gasPrice: txParams.gasPrice ? BigInt(txParams.gasPrice) : undefined,
    nonce: txParams.nonce ? Number(txParams.nonce) : undefined,
  };

  let result: Awaited<ReturnType<typeof broadcastGarudaTransaction>>;
  try {
    result = await broadcastGarudaTransaction(walletClient, broadcastInput);
  } catch (err) {
    if (!isInsufficientGasError(err)) throw err;
    await ensureGarudaWalletGas({
      uid: input.uid,
      walletAddress: owner,
      estimatedGasSda: 0.08,
      txCount: 1,
    });
    await new Promise((r) => setTimeout(r, 2500));
    try {
      result = await broadcastGarudaTransaction(walletClient, broadcastInput);
    } catch (retryErr) {
      if (isInsufficientGasError(retryErr)) {
        throw new Error(GARUDA_GAS_USER_MESSAGE);
      }
      throw retryErr;
    }
  }

  const hash = result.txHash;

  try {
    await adminDb()
      .collection("garuda_native_wallets")
      .where("uid", "==", input.uid)
      .limit(1)
      .get()
      .then((snap) => {
        if (!snap.empty) {
          return snap.docs[0].ref.update({
            lastSignedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });
  } catch (err) {
    if (!isFirestoreQuotaError(err)) throw err;
  }

  await logGarudaSignEvent({
    uid: input.uid,
    walletAddress: owner,
    method: "eth_sendTransaction",
    txHash: hash,
    status: "ok",
  }).catch((err) => {
    if (!isFirestoreQuotaError(err)) throw err;
  });

  return { txHash: hash, pending: result.pending };
}

export async function signGarudaPersonalMessage(input: {
  uid: string;
  address: string;
  message: string;
}): Promise<{ signature: Hex }> {
  if (!isGarudaNativeWalletEnabled()) {
    throw new Error("Garuda native wallet not enabled");
  }

  await assertGarudaWalletOwner(input.uid, input.address);
  const account = deriveGarudaAccountForUid(input.uid);

  const signature = await account.signMessage({ message: input.message });

  await logGarudaSignEvent({
    uid: input.uid,
    walletAddress: input.address,
    method: "personal_sign",
    status: "ok",
  });

  return { signature };
}
