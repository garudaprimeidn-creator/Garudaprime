/**
 * Local Pay Hub API, same routes as Vercel, no `vercel login` required.
 * Requires FIREBASE_SERVICE_ACCOUNT in .env.local (JSON one line).
 */
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { settlePayHub, fetchReceiptByCode, verifyBearerToken, payHubErrorStatus, type SettleBody } from "./payHubCore";
import { getPayLedger, withdrawPayHubGat, depositPayHubGat, payLedgerErrorStatus } from "./payLedgerCore.js";
import { swapPayHubLedger, confirmOnChainSwap, paySwapErrorStatus } from "./paySwapCore.js";
import { verifyWalletAuthPayload, walletAuthErrorStatus, type WalletAuthBody } from "./walletAuthCore";
import { applyValidator, validatorErrorStatus, type ValidatorApplyBody } from "./validatorCore";
import { relayBridgeMint, bridgeErrorStatus, type BridgeMintBody } from "./bridgeRelayCore";
import { handleKycUpload, kycUploadErrorStatus, type KycUploadBody } from "./kycUploadCore";
import { getFeeConfig, getProtocolTreasurySummary, settleProtocolAction } from "./protocolCore.js";
import { getCommunityFundsPublicSummary } from "./communityFundsCore.js";
import { getInvestmentFundsConfig, incrementFundRaised } from "./investmentFundsCore.js";
import { getPlatformProgramsBundle } from "./platformProgramsCore.js";

const loadEnv = () => {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
};

loadEnv();

const PORT = Number(process.env.PAY_HUB_LOCAL_PORT) || 3000;
const cors = (res: http.ServerResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const readBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const sendJson = (res: http.ServerResponse, status: number, data: unknown) => {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname.replace(/\/$/, "") || "/";

  try {
    if (req.method === "GET" && (path === "/api/health" || path === "/health")) {
      sendJson(res, 200, { ok: true, service: "Garuda Pay Hub", phase: 1, runtime: "local" });
      return;
    }

    const receiptMatch = path.match(/^\/api\/pay\/receipt\/([^/]+)$/);
    if (req.method === "GET" && receiptMatch) {
      await verifyBearerToken(req.headers.authorization);
      const receipt = await fetchReceiptByCode(decodeURIComponent(receiptMatch[1]));
      if (!receipt) {
        sendJson(res, 404, { error: "Receipt not found" });
        return;
      }
      sendJson(res, 200, { receipt });
      return;
    }

    if (req.method === "POST" && (path === "/api/pay/settle" || path === "/pay/settle")) {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as SettleBody;
      const result = await settlePayHub(body, decoded.uid);
      sendJson(res, 200, result);
      return;
    }

    if (path === "/api/pay/ledger" || path === "/pay/ledger") {
      try {
        const decoded = await verifyBearerToken(req.headers.authorization);
        if (req.method === "GET") {
          sendJson(res, 200, await getPayLedger(decoded.uid));
          return;
        }
        if (req.method === "POST") {
          const raw = await readBody(req);
          const body = JSON.parse(raw || "{}") as { amount?: number | string; walletAddress?: string };
          const amount = typeof body.amount === "string" ? Number(body.amount) : Number(body.amount);
          const result = await withdrawPayHubGat(decoded.uid, String(body.walletAddress ?? "").trim(), amount);
          sendJson(res, 200, result);
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJson(res, payLedgerErrorStatus(msg), { error: msg });
        return;
      }
    }

    if (req.method === "POST" && (path === "/api/pay/deposit" || path === "/pay/deposit")) {
      try {
        const decoded = await verifyBearerToken(req.headers.authorization);
        const raw = await readBody(req);
        const body = JSON.parse(raw || "{}") as { txHash?: string; walletAddress?: string };
        const result = await depositPayHubGat(
          decoded.uid,
          String(body.walletAddress ?? "").trim(),
          String(body.txHash ?? "").trim(),
        );
        sendJson(res, 200, result);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJson(res, payLedgerErrorStatus(msg), { error: msg });
        return;
      }
    }

    if (req.method === "POST" && (path === "/api/pay/swap" || path === "/pay/swap")) {
      try {
        const decoded = await verifyBearerToken(req.headers.authorization);
        const raw = await readBody(req);
        const body = JSON.parse(raw || "{}") as {
          mode?: string;
          from?: string;
          to?: string;
          amount?: number | string;
          txHash?: string;
          walletAddress?: string;
        };
        if (body.mode === "onchain") {
          const result = await confirmOnChainSwap(
            decoded.uid,
            String(body.walletAddress ?? "").trim(),
            String(body.txHash ?? "").trim(),
            body.from as "GAT" | "SDA",
            body.to as "GAT" | "SDA",
          );
          sendJson(res, 200, result);
          return;
        }
        const amount = typeof body.amount === "string" ? Number(body.amount) : Number(body.amount);
        const result = await swapPayHubLedger(
          decoded.uid,
          body.from as "GAT" | "SDA",
          body.to as "GAT" | "SDA",
          amount,
          String(body.walletAddress ?? "").trim() || undefined,
        );
        sendJson(res, 200, result);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJson(res, paySwapErrorStatus(msg), { error: msg });
        return;
      }
    }

    if (req.method === "POST" && (path === "/api/auth/wallet" || path === "/auth/wallet")) {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as WalletAuthBody;
      const customToken = await verifyWalletAuthPayload(body);
      sendJson(res, 200, { customToken });
      return;
    }

    if (req.method === "POST" && (path === "/api/auth/kycport" || path === "/auth/kycport")) {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}");
      const { verifyKycPortAuthPayload } = await import("./kycportAuthCore.js");
      const result = await verifyKycPortAuthPayload(body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && (path === "/api/validators/apply" || path === "/validators/apply")) {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as ValidatorApplyBody;
      const result = await applyValidator(body, decoded.uid);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && (path === "/api/bridge/mint" || path === "/bridge/mint")) {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as BridgeMintBody;
      const result = await relayBridgeMint(body, decoded.uid);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && (path === "/api/protocol/fees" || path === "/protocol/fees")) {
      const config = await getFeeConfig();
      sendJson(res, 200, {
        ratesBps: config.ratesBps,
        distributionBps: config.distributionBps,
        updatedAt: config.updatedAt ?? null,
        source: config.source,
      });
      return;
    }

    if (req.method === "GET" && (path === "/api/protocol/treasury" || path === "/protocol/treasury")) {
      await verifyBearerToken(req.headers.authorization);
      const summary = await getProtocolTreasurySummary();
      sendJson(res, 200, summary);
      return;
    }

    if (req.method === "GET" && (path === "/api/protocol/community-funds" || path === "/protocol/community-funds")) {
      const summary = await getCommunityFundsPublicSummary();
      sendJson(res, 200, summary);
      return;
    }

    if (req.method === "GET" && (path === "/api/protocol/health" || path === "/protocol/health")) {
      const { getProtocolHealthReport } = await import("./protocolHealthCore.js");
      const report = await getProtocolHealthReport();
      sendJson(res, 200, report);
      return;
    }

    if (req.method === "GET" && (path === "/api/investment/funds" || path === "/investment/funds")) {
      const config = await getInvestmentFundsConfig();
      sendJson(res, 200, {
        funds: config.funds,
        round: config.round ?? null,
        source: config.source,
        updatedAt: config.updatedAt ?? null,
      });
      return;
    }

    if (req.method === "GET" && (path === "/api/platform/programs" || path === "/platform/programs")) {
      const bundle = await getPlatformProgramsBundle();
      sendJson(res, 200, bundle);
      return;
    }

    if (req.method === "POST" && (path === "/api/referral/bind" || path === "/referral/bind")) {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as { code?: string };
      const { bindReferralCode } = await import("./referralCore.js");
      const result = await bindReferralCode(decoded.uid, String(body.code ?? ""));
      if (!result.ok) {
        sendJson(res, 400, { error: result.error });
        return;
      }
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && (path === "/api/referral/stats" || path === "/referral/stats")) {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const { getUserReferralStats } = await import("./referralCore.js");
      const stats = await getUserReferralStats(decoded.uid, decoded.email);
      sendJson(res, 200, stats);
      return;
    }

    if (req.method === "POST" && (path === "/api/referral/process-kyc" || path === "/referral/process-kyc")) {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const { runReferralAutoRewardEngine } = await import("./referralCore.js");
      const result = await runReferralAutoRewardEngine(decoded.uid);
      sendJson(res, 200, {
        processed: result.baseProcessed,
        pendingSynced: result.pendingSynced,
        tierBonus: result.tierBonus || undefined,
      });
      return;
    }

    if (req.method === "POST" && (path === "/api/referral/sync" || path === "/referral/sync")) {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const { runReferralAutoRewardEngine, getUserReferralStats } = await import("./referralCore.js");
      const engine = await runReferralAutoRewardEngine(decoded.uid);
      const stats = await getUserReferralStats(decoded.uid, decoded.email);
      sendJson(res, 200, { ...engine, stats });
      return;
    }

    if (req.method === "GET" && (path === "/api/nft/portfolio" || path === "/nft/portfolio")) {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const locale = url.searchParams.get("locale") === "en" ? "en" : "id";
      const { getUserUtilityNftPortfolio } = await import("./utilityNftCore.js");
      const portfolio = await getUserUtilityNftPortfolio(decoded.uid, locale);
      sendJson(res, 200, portfolio);
      return;
    }

    if (req.method === "POST" && (path === "/api/nft/sync" || path === "/nft/sync")) {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const body = JSON.parse((await readBody(req)) || "{}");
      const locale = body.locale === "en" ? "en" : "id";
      const { syncUserUtilityNfts } = await import("./utilityNftCore.js");
      const result = await syncUserUtilityNfts(decoded.uid, locale);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && (path === "/api/validators/stats" || path === "/validators/stats")) {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const { getUserValidatorStats } = await import("./validatorRewardsCore.js");
      const stats = await getUserValidatorStats(decoded.uid);
      sendJson(res, 200, stats);
      return;
    }

    if (req.method === "POST" && (path === "/api/investment/record-deposit" || path === "/investment/record-deposit")) {
      await verifyBearerToken(req.headers.authorization);
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as { fundId?: number; amountUsd?: number };
      const fundId = Number(body.fundId);
      const amountUsd = Number(body.amountUsd);
      if (!fundId || !Number.isFinite(amountUsd) || amountUsd <= 0) {
        sendJson(res, 400, { error: "Invalid request" });
        return;
      }
      await incrementFundRaised(fundId, amountUsd);
      sendJson(res, 200, { ok: true, fundId, amountUsd });
      return;
    }

    if (req.method === "POST" && (path === "/api/protocol/settle" || path === "/protocol/settle")) {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as {
        action?: string;
        grossAmountGat?: number;
        refId?: string;
        amountSda?: number;
        productId?: string;
        merchantSplits?: { merchantId?: string; grossGat?: number; orderId?: string }[];
      };
      const actions = new Set([
        "market_checkout",
        "sda_lock", "sda_unlock", "zakat_pay", "charity_donate",
      ]);
      if (!body.action || !actions.has(body.action) || !body.refId) {
        sendJson(res, 400, { error: "Invalid request" });
        return;
      }
      const merchantSplits = Array.isArray(body.merchantSplits)
        ? body.merchantSplits
            .map((row) => ({
              merchantId: String(row.merchantId ?? "").trim(),
              grossGat: parseFloat(String(row.grossGat ?? "0")),
              orderId: row.orderId ? String(row.orderId) : undefined,
            }))
            .filter((row) => row.merchantId && row.grossGat > 0)
        : undefined;
      const result = await settleProtocolAction(
        decoded.uid,
        body.action as Parameters<typeof settleProtocolAction>[1],
        Number(body.grossAmountGat ?? 0),
        body.refId,
        { amountSda: body.amountSda, productId: body.productId, merchantSplits },
      );
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (
      req.method === "POST"
      && (path === "/api/protocol/verify-invest" || path === "/protocol/verify-invest")
    ) {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as {
        refId?: string;
        txHash?: string;
        walletAddress?: string;
        fundId?: number;
        positionId?: number;
      };
      const { verifyAndRecordOnChainInvest } = await import("./protocolOnChainVerify.js");
      const result = await verifyAndRecordOnChainInvest({
        uid: decoded.uid,
        refId: String(body.refId ?? "").trim(),
        txHash: String(body.txHash ?? "").trim(),
        walletAddress: String(body.walletAddress ?? "").trim(),
        fundId: Number(body.fundId),
        positionId: body.positionId != null ? Number(body.positionId) : undefined,
      });
      sendJson(res, 200, result);
      return;
    }

    if (
      req.method === "POST"
      && (path === "/api/protocol/verify-stake" || path === "/protocol/verify-stake")
    ) {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as {
        refId?: string;
        txHash?: string;
        walletAddress?: string;
        stakeId?: number;
      };
      const { verifyAndRecordOnChainStake } = await import("./protocolOnChainVerify.js");
      const result = await verifyAndRecordOnChainStake({
        uid: decoded.uid,
        refId: String(body.refId ?? "").trim(),
        txHash: String(body.txHash ?? "").trim(),
        walletAddress: String(body.walletAddress ?? "").trim(),
        stakeId: body.stakeId != null ? Number(body.stakeId) : undefined,
      });
      sendJson(res, 200, result);
      return;
    }

    if (
      req.method === "POST"
      && (path === "/api/protocol/legacy-redeem-invest" || path === "/protocol/legacy-redeem-invest")
    ) {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as {
        refId?: string;
        grossAmountGat?: number;
        walletAddress?: string;
      };
      const { releaseLegacyInvestPosition } = await import("./protocolLegacyPayout.js");
      const result = await releaseLegacyInvestPosition({
        uid: decoded.uid,
        positionRefId: String(body.refId ?? "").trim(),
        grossAmountGat: Number(body.grossAmountGat),
        walletAddress: String(body.walletAddress ?? "").trim(),
      });
      sendJson(res, 200, result);
      return;
    }

    if (
      req.method === "POST"
      && (path === "/api/protocol/legacy-unstake-gat" || path === "/protocol/legacy-unstake-gat")
    ) {
      const decoded = await verifyBearerToken(req.headers.authorization);
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as {
        refId?: string;
        grossAmountGat?: number;
        walletAddress?: string;
      };
      const { releaseLegacyStakePosition } = await import("./protocolLegacyPayout.js");
      const result = await releaseLegacyStakePosition({
        uid: decoded.uid,
        positionRefId: String(body.refId ?? "").trim(),
        grossAmountGat: Number(body.grossAmountGat),
        walletAddress: String(body.walletAddress ?? "").trim(),
      });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && (path === "/api/kyc/upload" || path === "/kyc/upload")) {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as KycUploadBody;
      const result = await handleKycUpload(req.headers.authorization, body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && (path === "/api/kyc/submit" || path === "/kyc/submit")) {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}");
      const { handleKycSubmit, kycSubmitErrorStatus } = await import("./kycSubmitCore.js");
      try {
        const result = await handleKycSubmit(req.headers.authorization, body);
        sendJson(res, 200, result);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Internal error";
        sendJson(res, kycSubmitErrorStatus(message), { error: message });
      }
      return;
    }

    const kycportMatch = path.match(/^\/(?:api\/)?kycport\/(.+)$/);
    if (kycportMatch) {
      const sub = kycportMatch[1];
      const {
        exchangeKycPortCodeServer,
        fetchKycPortKycServer,
        fetchKycPortUserServer,
        normalizeKycPortKyc,
        normalizeKycPortUser,
      } = await import("./kycportCore.js");

      const bearer = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7).trim()
        : null;

      if (req.method === "GET" && sub === "health") {
        const { checkKycPortHealth } = await import("./kycportCore.js");
        sendJson(res, 200, await checkKycPortHealth());
        return;
      }

      if (req.method === "GET" && sub === "sso/config") {
        const handler = (await import("./handlers/kycport-sso-config.js")).default;
        await handler(
          req as import("@vercel/node").VercelRequest,
          res as import("@vercel/node").VercelResponse,
        );
        return;
      }

      if (req.method === "POST" && sub === "oauth/callback") {
        const raw = await readBody(req);
        const body = JSON.parse(raw || "{}") as { code?: string; codeVerifier?: string; redirectUri?: string };
        const tokenPayload = await exchangeKycPortCodeServer(
          String(body.code ?? "").trim(),
          String(body.codeVerifier ?? "").trim(),
          body.redirectUri,
        );
        sendJson(res, 200, tokenPayload);
        return;
      }

      if (req.method === "GET" && sub === "me") {
        if (!bearer) {
          sendJson(res, 401, { error: "Bearer token required" });
          return;
        }
        const raw = await fetchKycPortUserServer(bearer);
        sendJson(res, 200, { user: normalizeKycPortUser(raw), raw });
        return;
      }

      if (req.method === "GET" && sub === "kyc") {
        if (!bearer) {
          sendJson(res, 401, { error: "Bearer token required" });
          return;
        }
        const raw = await fetchKycPortKycServer(bearer);
        sendJson(res, 200, { kyc: normalizeKycPortKyc(raw), raw });
        return;
      }

      if (req.method === "GET" && sub === "sync") {
        if (!bearer) {
          sendJson(res, 401, { error: "Bearer token required" });
          return;
        }
        const [userRaw, kycRaw] = await Promise.all([
          fetchKycPortUserServer(bearer).catch(() => ({})),
          fetchKycPortKycServer(bearer).catch(() => ({})),
        ]);
        const user = normalizeKycPortUser(userRaw);
        const kyc = normalizeKycPortKyc(kycRaw);
        sendJson(res, 200, {
          user: {
            ...user,
            kycStatus: kyc.status || user.kycStatus,
            kycTier: kyc.tier || user.kycTier,
            verifiedAt: kyc.verifiedAt ?? user.verifiedAt,
          },
        });
        return;
      }
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    const status = message.includes("signature") || message.includes("Missing")
      ? walletAuthErrorStatus(message)
      : message === "Invalid application" || message === "Unauthorized"
        ? validatorErrorStatus(message)
        : message.includes("tidak valid") || message.includes("Payload") || message.includes("terlalu besar")
          ? kycUploadErrorStatus(message)
          : message.includes("Invalid") || message.includes("mismatch") || message.includes("Bridge")
            ? bridgeErrorStatus(message)
            : payHubErrorStatus(message);
    sendJson(res, status, { error: message });
  }
});

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("\n❌ Set FIREBASE_SERVICE_ACCOUNT in .env.local (Firebase service account JSON, one line)\n");
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`\n✓ Garuda Pay Hub local API → http://127.0.0.1:${PORT}/api`);
  console.log(`  Health: http://127.0.0.1:${PORT}/api/health\n`);
});
