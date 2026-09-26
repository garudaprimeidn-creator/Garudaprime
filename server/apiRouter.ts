import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "./vercelCors.js";
import health from "./handlers/health.js";
import paySettle from "./handlers/pay-settle.js";
import payMerchantLink from "./handlers/pay-merchant-link.js";
import payMerchantEnsure from "./handlers/pay-merchant-ensure.js";
import payMerchantProfile from "./handlers/pay-merchant-profile.js";
import payMerchantLookup from "./handlers/pay-merchant-lookup.js";
import payLedger from "./handlers/pay-ledger.js";
import payDeposit from "./handlers/pay-deposit.js";
import paySwap from "./handlers/pay-swap.js";
import payReceipt from "./handlers/pay-receipt.js";
import authWallet from "./handlers/auth-wallet.js";
import authWalletNonce from "./handlers/auth-wallet-nonce.js";
import authKycport from "./handlers/auth-kycport.js";
import bridgeMint from "./handlers/bridge-mint.js";
import validatorsApply from "./handlers/validators-apply.js";
import protocolFees from "./handlers/protocol-fees.js";
import protocolTreasury from "./handlers/protocol-treasury.js";
import protocolCommunityFunds from "./handlers/protocol-community-funds.js";
import protocolSettle from "./handlers/protocol-settle.js";
import protocolVerifyInvest from "./handlers/protocol-verify-invest.js";
import protocolVerifyStake from "./handlers/protocol-verify-stake.js";
import protocolLegacySummary from "./handlers/protocol-legacy-summary.js";
import protocolLegacyRedeemInvest from "./handlers/protocol-legacy-redeem-invest.js";
import protocolLegacyUnstakeGat from "./handlers/protocol-legacy-unstake-gat.js";
import protocolHealth from "./handlers/protocol-health.js";
import investmentFunds from "./handlers/investment-funds.js";
import investmentRecordDeposit from "./handlers/investment-record-deposit.js";
import platformPrograms from "./handlers/platform-programs.js";
import referralBind from "./handlers/referral-bind.js";
import referralStats from "./handlers/referral-stats.js";
import referralProcessKyc from "./handlers/referral-process-kyc.js";
import referralSync from "./handlers/referral-sync.js";
import validatorsStats from "./handlers/validators-stats.js";
import kycUpload from "./handlers/kyc-upload.js";
import marketplaceProductSync from "./handlers/marketplace-product-sync.js";
import marketplaceProductImage from "./handlers/marketplace-product-image.js";
import marketplaceProductMedia from "./handlers/marketplace-product-media.js";
import kycSubmit from "./handlers/kyc-submit.js";
import garudaRpc from "./handlers/garuda-rpc.js";
import garudaHealth from "./handlers/garuda-health.js";
import kycportProxy from "./handlers/kycport-proxy.js";
import kycportSsoConfig from "./handlers/kycport-sso-config.js";
import kycportWebhook from "./handlers/kycport-webhook.js";
import payTransfer from "./handlers/pay-transfer.js";
import payApproval from "./handlers/pay-approval.js";
import walletResolve from "./handlers/wallet-resolve.js";
import walletTransferNotify from "./handlers/wallet-transfer-notify.js";
import payRelayerHealth from "./handlers/pay-relayer-health.js";
import payRelayerFailed from "./handlers/pay-relayer-process-failed.js";
import walletEmbeddedConfig from "./handlers/wallet-embedded-config.js";
import walletEmbeddedBind from "./handlers/wallet-embedded-bind.js";
import walletActivate from "./handlers/wallet-activate.js";
import walletGarudaConfig from "./handlers/wallet-garuda-config.js";
import walletGarudaOtpSend from "./handlers/wallet-garuda-otp-send.js";
import walletGarudaOtpVerify from "./handlers/wallet-garuda-otp-verify.js";
import walletGarudaCreate from "./handlers/wallet-garuda-create.js";
import walletGarudaSign from "./handlers/wallet-garuda-sign.js";
import walletGarudaGas from "./handlers/wallet-garuda-gas.js";
import walletGarudaChallenge from "./handlers/wallet-garuda-challenge.js";
import walletGarudaProvisionKyc from "./handlers/wallet-garuda-provision-kyc.js";
import walletGarudaSecurity from "./handlers/wallet-garuda-security.js";
import walletGarudaFreeze from "./handlers/wallet-garuda-freeze.js";
import walletGarudaRecovery from "./handlers/wallet-garuda-recovery.js";
import walletGarudaExport from "./handlers/wallet-garuda-export.js";
import walletGarudaVerifyRecovery from "./handlers/wallet-garuda-verify-recovery.js";
import protocolGovernanceVote from "./handlers/protocol-governance-vote.js";
import protocolGovernanceProposal from "./handlers/protocol-governance-proposal.js";
import protocolGovernanceClose from "./handlers/protocol-governance-close.js";
import aiChat from "./handlers/ai-chat.js";
import webhooksResend from "./handlers/webhooks-resend.js";
import nftPortfolio from "./handlers/nft-portfolio.js";
import nftSync from "./handlers/nft-sync.js";
import { resolveGarudaWalletMasterSecret, garudaKmsProvider } from "./garudaWalletKms.js";

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

async function missingPrivate(_req: VercelRequest, res: VercelResponse) {
  return res.status(404).json({ error: "Not found" });
}

const payAdminOps: Handler = async (req, res) => {
  try {
    return (await import("./handlers/pay-admin-ops.js")).default(req, res);
  } catch {
    return missingPrivate(req, res);
  }
};
const payRelayerRetry: Handler = async (req, res) => {
  try {
    return (await import("./handlers/pay-relayer-retry.js")).default(req, res);
  } catch {
    return missingPrivate(req, res);
  }
};
const paySettlementAudit: Handler = async (req, res) => {
  try {
    return (await import("./handlers/pay-settlement-audit.js")).default(req, res);
  } catch {
    return missingPrivate(req, res);
  }
};
const payMigration: Handler = async (req, res) => {
  try {
    return (await import("./handlers/pay-migration.js")).default(req, res);
  } catch {
    return missingPrivate(req, res);
  }
};
const payOnchainMonitor: Handler = async (req, res) => {
  try {
    return (await import("./handlers/pay-onchain-monitor.js")).default(req, res);
  } catch {
    return missingPrivate(req, res);
  }
};
const payCronDailyOps: Handler = async (req, res) => {
  try {
    return (await import("./handlers/pay-cron-daily-ops.js")).default(req, res);
  } catch {
    return missingPrivate(req, res);
  }
};
const payCronRetryRelayer: Handler = async (req, res) => {
  try {
    return (await import("./handlers/pay-cron-retry-relayer.js")).default(req, res);
  } catch {
    return missingPrivate(req, res);
  }
};
const payOpsHealth: Handler = async (req, res) => {
  try {
    return (await import("./handlers/pay-ops-health.js")).default(req, res);
  } catch {
    return missingPrivate(req, res);
  }
};
const qaCenterCron: Handler = async (req, res) => {
  try {
    return (await import("./handlers/qa-center-cron.js")).default(req, res);
  } catch {
    return missingPrivate(req, res);
  }
};
const qaCenterStatus: Handler = async (req, res) => {
  try {
    return (await import("./handlers/qa-center-status.js")).default(req, res);
  } catch {
    return missingPrivate(req, res);
  }
};
const qaJourneyAudit: Handler = async (req, res) => {
  try {
    return (await import("./handlers/qa-journey-audit.js")).default(req, res);
  } catch {
    return missingPrivate(req, res);
  }
};
const qaKycport: Handler = async (req, res) => {
  try {
    return (await import("./handlers/qa-kycport.js")).default(req, res);
  } catch {
    return missingPrivate(req, res);
  }
};

function extractApiPath(req: VercelRequest): string {
  const queryPath = req.query.path;
  if (Array.isArray(queryPath) && queryPath.length) {
    return queryPath.filter(Boolean).join("/");
  }
  if (typeof queryPath === "string" && queryPath) {
    return queryPath;
  }

  const rawUrl = req.url ?? "";
  const pathname = rawUrl.split("?")[0] ?? "";
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const match = normalized.match(/^\/api\/?(.*)$/);
  return match?.[1] ?? "";
}

const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  health: { GET: health },
  "ai/chat": { POST: aiChat },
  "pay/settle": { POST: paySettle },
  "pay/merchant/link": { POST: payMerchantLink },
  "pay/merchant/ensure": { POST: payMerchantEnsure },
  "pay/merchant/profile": { POST: payMerchantProfile, PATCH: payMerchantProfile },
  "pay/merchant/lookup": { GET: payMerchantLookup },
  "pay/ledger": { GET: payLedger, POST: payLedger },
  "pay/deposit": { POST: payDeposit },
  "pay/swap": { POST: paySwap },
  "pay/transfer": { POST: payTransfer },
  "pay/approval": { GET: payApproval },
  "pay/admin-ops": { POST: payAdminOps },
  "pay/relayer/health": { GET: payRelayerHealth },
  "pay/relayer/failed": { GET: payRelayerFailed },
  "pay/relayer/retry": { POST: payRelayerRetry },
  "pay/settlement/audit": { GET: paySettlementAudit, POST: paySettlementAudit },
  "pay/migration": { GET: payMigration, POST: payMigration },
  "pay/onchain/monitor": { GET: payOnchainMonitor },
  "pay/cron/daily-ops": { GET: payCronDailyOps, POST: payCronDailyOps },
  "pay/cron/retry-relayer": { GET: payCronRetryRelayer, POST: payCronRetryRelayer },
  "qa/cron": { GET: qaCenterCron, POST: qaCenterCron },
  "qa/status": { GET: qaCenterStatus, POST: qaCenterStatus },
  "qa/journey": { GET: qaJourneyAudit, POST: qaJourneyAudit },
  "qa/kycport": { GET: qaKycport, POST: qaKycport },
  "pay/ops/health": { GET: payOpsHealth },
  "auth/wallet": { POST: authWallet },
  "auth/wallet/nonce": { GET: authWalletNonce },
  "auth/kycport": { POST: authKycport },
  "bridge/mint": { POST: bridgeMint },
  "validators/apply": { POST: validatorsApply },
  "protocol/health": { GET: protocolHealth },
  "protocol/fees": { GET: protocolFees },
  "protocol/treasury": { GET: protocolTreasury },
  "protocol/community-funds": { GET: protocolCommunityFunds },
  "protocol/settle": { POST: protocolSettle },
  "protocol/verify-invest": { POST: protocolVerifyInvest },
  "protocol/verify-stake": { POST: protocolVerifyStake },
  "protocol/legacy-summary": { GET: protocolLegacySummary },
  "protocol/legacy-redeem-invest": { POST: protocolLegacyRedeemInvest },
  "protocol/legacy-unstake-gat": { POST: protocolLegacyUnstakeGat },
  "protocol/governance/vote": { POST: protocolGovernanceVote },
  "protocol/governance/proposal": { POST: protocolGovernanceProposal },
  "protocol/governance/close": { POST: protocolGovernanceClose },
  "investment/funds": { GET: investmentFunds },
  "investment/record-deposit": { POST: investmentRecordDeposit },
  "platform/programs": { GET: platformPrograms },
  "referral/bind": { POST: referralBind },
  "referral/stats": { GET: referralStats },
  "referral/process-kyc": { POST: referralProcessKyc },
  "referral/sync": { POST: referralSync },
  "validators/stats": { GET: validatorsStats },
  "kyc/upload": { POST: kycUpload },
  "marketplace/product/sync": { POST: marketplaceProductSync },
  "marketplace/product/image": { POST: marketplaceProductImage },
  "marketplace/product/media": { GET: marketplaceProductMedia },
  "kyc/submit": { POST: kycSubmit },
  "kycport/oauth/callback": { POST: kycportProxy },
  "kycport/sso/config": { GET: kycportSsoConfig },
  "kycport/health": { GET: kycportProxy },
  "kycport/me": { GET: kycportProxy },
  "kycport/kyc": { GET: kycportProxy },
  "kycport/sync": { GET: kycportProxy },
  "kycport/webhook": { POST: kycportWebhook },
  "garuda/rpc": { GET: garudaRpc, POST: garudaRpc },
  "garuda/health": { GET: garudaHealth },
  "wallet/resolve": { POST: walletResolve },
  "wallet/transfer/notify": { POST: walletTransferNotify },
  "wallet/embedded/config": { GET: walletEmbeddedConfig },
  "wallet/embedded/bind": { POST: walletEmbeddedBind },
  "wallet/activate": { POST: walletActivate },
  "wallet/garuda/config": { GET: walletGarudaConfig },
  "wallet/garuda/otp/send": { POST: walletGarudaOtpSend },
  "wallet/garuda/otp/verify": { POST: walletGarudaOtpVerify },
  "wallet/garuda/create": { POST: walletGarudaCreate },
  "wallet/garuda/sign": { POST: walletGarudaSign },
  "wallet/garuda/gas": { POST: walletGarudaGas },
  "wallet/garuda/challenge": { POST: walletGarudaChallenge },
  "wallet/garuda/provision-kyc": { POST: walletGarudaProvisionKyc },
  "wallet/garuda/security": { GET: walletGarudaSecurity },
  "wallet/garuda/freeze": { POST: walletGarudaFreeze },
  "wallet/garuda/recovery": { POST: walletGarudaRecovery },
  "wallet/garuda/export": { POST: walletGarudaExport },
  "wallet/garuda/verify-recovery": { POST: walletGarudaVerifyRecovery },
  "nft/portfolio": { GET: nftPortfolio },
  "nft/sync": { POST: nftSync },
  "webhooks/resend": { POST: webhooksResend },
};

let kmsWarmup: Promise<void> | null = null;
function warmGarudaKms(): void {
  if (garudaKmsProvider() !== "google") return;
  if (!kmsWarmup) {
    kmsWarmup = resolveGarudaWalletMasterSecret().then(() => undefined).catch((err) => {
      console.error("[garuda-kms] warmup failed:", err instanceof Error ? err.message : err);
    });
  }
}
warmGarudaKms();

export default async function dispatchApi(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  if (handleOptions(req.method, res, origin)) return;
  applyCors(res, origin);

  const routePath = extractApiPath(req);
  const segments = routePath ? routePath.split("/").filter(Boolean) : [];

  if (segments[0] === "pay" && segments[1] === "receipt" && segments[2]) {
    req.query.code = segments[2];
    return payReceipt(req, res);
  }

  const method = req.method ?? "GET";
  const handler = ROUTES[routePath]?.[method];

  if (!handler) {
    return res.status(404).json({ error: "Not found", path: routePath });
  }

  return handler(req, res);
}
