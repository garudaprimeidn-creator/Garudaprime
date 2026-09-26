import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken, payHubErrorStatus } from "../payHubCore.js";
import { assertInvestmentDepositSettlement } from "../protocolCore.js";
import { assertOnChainInvestmentSettlement } from "../protocolOnChainVerify.js";
import { incrementFundRaised } from "../investmentFundsCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = req.body ?? {};
    const fundId = parseInt(String(body.fundId ?? ""), 10);
    const amountUsd = parseFloat(String(body.amountUsd ?? ""));
    const amountGat = parseFloat(String(body.amountGat ?? body.amountUsd ?? ""));
    const refId = String(body.refId ?? "").trim();
    const txHash = body.txHash != null ? String(body.txHash).trim() : undefined;

    if (!refId) {
      return res.status(400).json({ error: "Missing refId" });
    }
    if (!Number.isFinite(fundId) || fundId < 1) {
      return res.status(400).json({ error: "Invalid fundId" });
    }
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return res.status(400).json({ error: "Invalid amountUsd" });
    }

    if (txHash) {
      if (!Number.isFinite(amountGat) || amountGat <= 0) {
        return res.status(400).json({ error: "Invalid amountGat" });
      }
      await assertOnChainInvestmentSettlement(decoded.uid, refId, fundId, amountGat, txHash);
    } else {
      await assertInvestmentDepositSettlement(decoded.uid, refId, fundId, amountUsd);
    }
    await incrementFundRaised(fundId, amountUsd);
    return res.status(200).json({ ok: true, fundId, amountUsd, amountGat, refId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = payHubErrorStatus(msg);
    return res.status(status).json({ error: msg });
  }
}
