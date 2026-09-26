/**
 * Referral reward payout, Pay Hub ledger + optional GATProtocolTreasury bucket (Sidra).
 * Blocked while REFERRAL_LOCKED_UNTIL_TOKEN_LAUNCH until usage is enabled.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import { getReferralProgramConfig } from "./platformProgramsCore.js";
import { creditLedger, deductReferralTreasury } from "./protocolCore.js";
import { getEmbeddedGatBalanceForUid } from "./chainBalanceService.js";
import {
  isReferralUsageEnabled,
  REFERRAL_LOCKED_UNTIL_TOKEN_LAUNCH,
} from "../src/lib/referral/referralProgramGate.js";
import {
  expectedTierBonus,
  REFERRAL_TREASURY_BUCKET,
  validateReferralProgramConfig,
  type ReferralDistributionMode,
  type ReferralPayoutKind,
} from "../src/lib/referral/referralRewardPolicy.js";

const PAYOUTS_COL = "referral_payouts";

const TREASURY_ABI = [
  {
    type: "function",
    name: "withdrawBucket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "bucket", type: "uint8" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "bucketBalances",
    stateMutability: "view",
    inputs: [{ name: "bucket", type: "uint8" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const sidraRpc = process.env.VITE_SIDRA_RPC_URL || "https://rpc.sidrachain.com";
const sidraChainId = Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453;

function chain() {
  return {
    id: sidraChainId,
    name: "Sidra",
    nativeCurrency: { name: "SDA", symbol: "SDA", decimals: 18 },
    rpcUrls: { default: { http: [sidraRpc] } },
  } as const;
}

function gatDecimals(): number {
  return Number(process.env.GAT_TOKEN_DECIMALS ?? 18);
}

function treasuryAddress(): Address | null {
  const raw = process.env.VITE_GAT_TREASURY_ADDRESS?.trim();
  return raw?.startsWith("0x") ? (raw as Address) : null;
}

function relayerKey(): Hex | null {
  const key =
    process.env.PAY_HUB_RELAYER_PRIVATE_KEY?.trim()
    || process.env.PROTOCOL_OWNER_PRIVATE_KEY?.trim()
    || process.env.DEPLOYER_PRIVATE_KEY?.trim();
  return key?.startsWith("0x") ? (key as Hex) : null;
}

function isReferralScAutoPayoutEnabled(): boolean {
  const raw = process.env.REFERRAL_SC_AUTO_PAYOUT?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export type ReferralPayoutReadiness = {
  lockedUntilTokenLaunch: boolean;
  usageEnabled: boolean;
  programEnabled: boolean;
  autoReward: boolean;
  distributionMode: ReferralDistributionMode;
  payoutReady: boolean;
  scTreasuryConfigured: boolean;
  scAutoPayoutEnabled: boolean;
  relayerConfigured: boolean;
  policyValid: boolean;
  policyErrors: string[];
};

export async function getReferralPayoutReadiness(): Promise<ReferralPayoutReadiness> {
  const config = await getReferralProgramConfig();
  const policy = validateReferralProgramConfig(config);
  const usageEnabled = isReferralUsageEnabled(config);
  const scTreasuryConfigured = Boolean(treasuryAddress());
  const scAutoPayoutEnabled = isReferralScAutoPayoutEnabled();
  const relayerConfigured = Boolean(relayerKey());

  let distributionMode: ReferralDistributionMode = "locked";
  if (usageEnabled && config.enabled) {
    distributionMode = scAutoPayoutEnabled && scTreasuryConfigured && relayerConfigured
      ? "sidra_treasury"
      : "pay_hub";
  }

  const payoutReady = Boolean(
    usageEnabled
    && config.enabled
    && config.autoReward !== false
    && policy.ok
    && (distributionMode === "pay_hub"
      || (distributionMode === "sidra_treasury" && scTreasuryConfigured && relayerConfigured)),
  );

  return {
    lockedUntilTokenLaunch: REFERRAL_LOCKED_UNTIL_TOKEN_LAUNCH,
    usageEnabled,
    programEnabled: config.enabled,
    autoReward: config.autoReward !== false,
    distributionMode,
    payoutReady,
    scTreasuryConfigured,
    scAutoPayoutEnabled,
    relayerConfigured,
    policyValid: policy.ok,
    policyErrors: policy.ok ? [] : policy.errors,
  };
}

async function readOnChainReferralBucketGat(): Promise<number | null> {
  const treasury = treasuryAddress();
  if (!treasury) return null;
  try {
    const client = createPublicClient({ chain: chain(), transport: http(sidraRpc) });
    const wei = await client.readContract({
      address: treasury,
      abi: TREASURY_ABI,
      functionName: "bucketBalances",
      args: [REFERRAL_TREASURY_BUCKET],
    });
    return Number(wei) / 10 ** gatDecimals();
  } catch {
    return null;
  }
}

async function withdrawReferralBucketOnChain(to: Address, amountGat: number): Promise<Hash> {
  const treasury = treasuryAddress();
  const key = relayerKey();
  if (!treasury || !key) {
    throw new Error("Referral SC payout: treasury or relayer not configured");
  }

  const onChainBucket = await readOnChainReferralBucketGat();
  if (onChainBucket != null && onChainBucket < amountGat) {
    throw new Error(`Referral SC bucket insufficient (have ~${onChainBucket.toFixed(4)} GAT)`);
  }

  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({
    account,
    chain: chain(),
    transport: http(sidraRpc),
  });
  const publicClient = createPublicClient({
    chain: chain(),
    transport: http(sidraRpc),
  });

  const amountStr = amountGat.toLocaleString("en-US", {
    maximumFractionDigits: 6,
    useGrouping: false,
  });
  const value = parseUnits(amountStr, gatDecimals());
  if (value <= 0n) throw new Error("Invalid referral payout amount");

  const hash = await wallet.writeContract({
    chain: chain(),
    account,
    address: treasury,
    abi: TREASURY_ABI,
    functionName: "withdrawBucket",
    args: [REFERRAL_TREASURY_BUCKET, to, value],
  });

  await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  return hash;
}

export type PayReferralRewardInput = {
  referrerUid: string;
  amountGat: number;
  payoutKind: ReferralPayoutKind;
  idempotencyKey: string;
  referredUid?: string;
  tierMinReferrals?: number;
};

export async function payReferralReward(input: PayReferralRewardInput): Promise<{
  paid: boolean;
  skipped?: boolean;
  channel?: "pay_hub" | "sidra_treasury" | "sidra_treasury_failed";
  txHash?: string;
  reason?: string;
}> {
  const config = await getReferralProgramConfig();
  if (!isReferralUsageEnabled(config)) {
    return { paid: false, skipped: true, reason: "referral_locked_until_token_launch" };
  }
  if (!config.enabled || config.autoReward === false) {
    return { paid: false, skipped: true, reason: "referral_program_disabled" };
  }

  const policy = validateReferralProgramConfig(config);
  if (!policy.ok) {
    return { paid: false, skipped: true, reason: `invalid_policy:${policy.errors.join(";")}` };
  }

  if (input.amountGat <= 0) return { paid: false, skipped: true, reason: "zero_amount" };

  if (input.payoutKind === "base" && input.amountGat !== config.baseRewardGat) {
    return { paid: false, skipped: true, reason: "base_amount_mismatch" };
  }
  if (input.payoutKind === "tier_bonus") {
    const expected = input.tierMinReferrals != null
      ? expectedTierBonus(config, input.tierMinReferrals)
      : null;
    if (expected == null || expected !== input.amountGat) {
      return { paid: false, skipped: true, reason: "tier_amount_mismatch" };
    }
  }

  const db = adminDb();
  const existing = await db.collection(PAYOUTS_COL)
    .where("idempotencyKey", "==", input.idempotencyKey)
    .limit(1)
    .get();
  if (!existing.empty) {
    const row = existing.docs[0]!.data();
    return {
      paid: row.status === "completed",
      skipped: true,
      channel: row.channel as "pay_hub" | "sidra_treasury" | "sidra_treasury_failed" | undefined,
      txHash: row.txHash as string | undefined,
      reason: "already_paid",
    };
  }

  const readiness = await getReferralPayoutReadiness();
  if (!readiness.payoutReady) {
    return { paid: false, skipped: true, reason: "payout_not_ready" };
  }

  await deductReferralTreasury(input.amountGat);

  let channel: "pay_hub" | "sidra_treasury" | "sidra_treasury_failed" = "pay_hub";
  let txHash: string | undefined;

  if (readiness.distributionMode === "sidra_treasury") {
    const { walletAddress } = await getEmbeddedGatBalanceForUid(input.referrerUid);
    if (!walletAddress) {
      await creditLedger(input.referrerUid, input.amountGat, "protocol");
      channel = "pay_hub";
    } else {
      try {
        txHash = await withdrawReferralBucketOnChain(walletAddress as Address, input.amountGat);
        channel = "sidra_treasury";
      } catch {
        channel = "sidra_treasury_failed";
        await creditLedger(input.referrerUid, input.amountGat, "protocol");
      }
    }
  } else {
    await creditLedger(input.referrerUid, input.amountGat, "protocol");
  }

  await db.collection(PAYOUTS_COL).add({
    referrerUid: input.referrerUid,
    referredUid: input.referredUid ?? null,
    payoutKind: input.payoutKind,
    amountGat: input.amountGat,
    idempotencyKey: input.idempotencyKey,
    tierMinReferrals: input.tierMinReferrals ?? null,
    channel,
    txHash: txHash ?? null,
    status: "completed",
    createdAt: FieldValue.serverTimestamp(),
  });

  return { paid: true, channel, txHash };
}
