import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyBearerToken } from "../payHubCore.js";
import { getPayHubGatAllowance, resolvePayHubPaymentSpender } from "../payHubApprovalCore.js";
import { resolvePrimaryWalletForUid } from "../chainBalanceService.js";
import { isPayHubOnChainConfigured } from "../payHubLedgerMode.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const wallet = await resolvePrimaryWalletForUid(decoded.uid);

    if (!isPayHubOnChainConfigured()) {
      return res.status(200).json({
        configured: false,
        walletAddress: wallet,
        sufficient: true,
      });
    }

    if (!wallet) {
      return res.status(200).json({
        configured: true,
        walletAddress: null,
        sufficient: false,
        needsWallet: true,
      });
    }

    const allowance = await getPayHubGatAllowance(wallet);
    return res.status(200).json({
      configured: true,
      walletAddress: wallet,
      spender: resolvePayHubPaymentSpender(),
      allowanceGat: allowance?.allowanceGat ?? 0,
      sufficient: allowance?.sufficient ?? false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(401).json({ error: msg });
  }
}
