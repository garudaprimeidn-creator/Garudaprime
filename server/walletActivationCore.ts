/**
 * Aktivasi dompet Pay Hub, airdrop SDA kecil dari relayer agar user bisa approve GAT
 * tanpa beli gas sendiri (fondasi sebelum Privy gasless penuh).
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import {
  isRelayerConfigured,
  readRelayerNativeBalanceSda,
  relayerSendNativeSda,
} from "./payRelayerCore.js";
import { isPayHubOnChainConfigured } from "./payHubLedgerMode.js";

const ACTIVATIONS_COL = "wallet_activation_grants";

export function isWalletActivationEnabled(): boolean {
  const raw = process.env.WALLET_ACTIVATION_ENABLED?.trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  if (!isPayHubOnChainConfigured()) return false;
  return isRelayerConfigured();
}

export function walletActivationSdaAmount(): number {
  const n = Number(process.env.WALLET_ACTIVATION_SDA_AMOUNT ?? 0.05);
  if (!Number.isFinite(n) || n <= 0) return 0.05;
  return Math.min(n, 0.2);
}

/** Lewati airdrop jika dompet sudah punya cukup SDA untuk approve. */
export function walletActivationSkipBalanceSda(): number {
  const n = Number(process.env.WALLET_ACTIVATION_SKIP_BALANCE_SDA ?? 0.012);
  return Number.isFinite(n) && n > 0 ? n : 0.012;
}

export function walletActivationMaxPerDay(): number {
  const n = Number(process.env.WALLET_ACTIVATION_MAX_PER_DAY ?? 200);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 200;
}

export function getWalletActivationPublicConfig() {
  return {
    enabled: isWalletActivationEnabled(),
    amountSda: walletActivationSdaAmount(),
    skipBalanceSda: walletActivationSkipBalanceSda(),
    maxPerDay: walletActivationMaxPerDay(),
    paymasterEnabled:
      process.env.RELAYER_PAYMASTER_ENABLED?.trim().toLowerCase() === "true"
      || process.env.RELAYER_PAYMASTER_ENABLED === "1",
  };
}

function normalizeWallet(address: string): string {
  const v = address.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(v)) throw new Error("Invalid wallet address");
  return v.toLowerCase();
}

async function activationsTodayCount(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const snap = await adminDb()
    .collection(ACTIVATIONS_COL)
    .where("createdAt", ">=", Timestamp.fromDate(start))
    .count()
    .get();
  return snap.data().count;
}

export type WalletActivationResult = {
  enabled: boolean;
  granted: boolean;
  skipped: boolean;
  reason?: string;
  txHash?: string;
  amountSda?: number;
  nativeBalanceSda?: number;
};

export async function grantWalletActivationSda(input: {
  uid: string;
  walletAddress: string;
}): Promise<WalletActivationResult> {
  if (!isWalletActivationEnabled()) {
    return { enabled: false, granted: false, skipped: true, reason: "disabled" };
  }

  const wallet = normalizeWallet(input.walletAddress);
  const docId = `${input.uid}_${wallet}`;
  const docRef = adminDb().collection(ACTIVATIONS_COL).doc(docId);
  const existing = await docRef.get();
  if (existing.exists) {
    const data = existing.data();
    const balance = await readRelayerNativeBalanceSda(wallet).catch(() => null);
    return {
      enabled: true,
      granted: false,
      skipped: true,
      reason: "already_granted",
      txHash: data?.txHash as string | undefined,
      amountSda: data?.amountSda as number | undefined,
      nativeBalanceSda: balance ?? undefined,
    };
  }

  const today = await activationsTodayCount();
  if (today >= walletActivationMaxPerDay()) {
    return { enabled: true, granted: false, skipped: true, reason: "daily_limit" };
  }

  const balance = await readRelayerNativeBalanceSda(wallet);
  const skipAt = walletActivationSkipBalanceSda();
  if (balance >= skipAt) {
    await docRef.set({
      uid: input.uid,
      walletAddress: wallet,
      skipped: true,
      reason: "sufficient_balance",
      nativeBalanceSda: balance,
      amountSda: 0,
      createdAt: FieldValue.serverTimestamp(),
    });
    return {
      enabled: true,
      granted: false,
      skipped: true,
      reason: "sufficient_balance",
      nativeBalanceSda: balance,
    };
  }

  const amountSda = walletActivationSdaAmount();
  const txHash = await relayerSendNativeSda({ toAddress: wallet, amountSda });

  await docRef.set({
    uid: input.uid,
    walletAddress: wallet,
    amountSda,
    txHash,
    skipped: false,
    nativeBalanceSdaBefore: balance,
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    enabled: true,
    granted: true,
    skipped: false,
    txHash,
    amountSda,
    nativeBalanceSda: balance,
  };
}
