import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { verifyBearerToken } from "../payHubCore.js";
import { isGarudaNativeWalletEnabled, logGarudaSignEvent, resolveCanonicalGarudaWalletAddress } from "../garudaWalletCore.js";
import {
  signAndBroadcastGarudaTransaction,
  signGarudaPersonalMessage,
} from "../garudaWalletSigner.js";
import { consumeGarudaSignSession } from "../garudaWalletSecurity.js";
import { ensureGarudaWalletGas, estimateGarudaTxGasSda, GARUDA_GAS_USER_MESSAGE, isInsufficientGasError } from "../garudaWalletGasSponsor.js";

type SignBody = {
  address?: string;
  method?: string;
  transaction?: Record<string, string>;
  message?: string;
  signToken?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  if (handleOptions(req.method, res, origin)) return;
  applyCors(res, origin);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!isGarudaNativeWalletEnabled()) {
      return res.status(503).json({ error: "Garuda native wallet not enabled" });
    }

    const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
    const body = (req.body ?? {}) as SignBody;
    const address = String(body.address ?? "").trim();
    const method = String(body.method ?? "eth_sendTransaction").trim();

    if (!address.startsWith("0x")) {
      return res.status(400).json({ error: "Wallet address required" });
    }

    const canonical = await resolveCanonicalGarudaWalletAddress(decoded.uid, address);
    const signingAddress = canonical ?? address;

    await consumeGarudaSignSession({
      uid: decoded.uid,
      signToken: String(body.signToken ?? ""),
      walletAddress: signingAddress,
    });

    if (method === "eth_sendTransaction") {
      const tx = body.transaction ?? {};
      const estimated = await estimateGarudaTxGasSda(signingAddress, tx).catch(() => 0.06);
      await ensureGarudaWalletGas({
        uid: decoded.uid,
        walletAddress: signingAddress,
        estimatedGasSda: estimated,
        txCount: 1,
      });
    }

    if (method === "personal_sign" || method === "eth_sign") {
      const message = String(body.message ?? "");
      if (!message) return res.status(400).json({ error: "Message required" });
      const { signature } = await signGarudaPersonalMessage({
        uid: decoded.uid,
        address: signingAddress,
        message,
      });
      return res.status(200).json({ ok: true, signature });
    }

    if (method === "eth_sendTransaction") {
      const tx = body.transaction ?? {};
      const { txHash } = await signAndBroadcastGarudaTransaction({
        uid: decoded.uid,
        address: signingAddress,
        transaction: tx,
      });
      return res.status(200).json({ ok: true, txHash });
    }

    return res.status(400).json({ error: `Unsupported sign method: ${method}` });
  } catch (err) {
    let msg = err instanceof Error ? err.message : String(err);
    if (isInsufficientGasError(err)) {
      msg = GARUDA_GAS_USER_MESSAGE;
    }
    const status = msg.includes("token") || msg.includes("Authorization") ? 401 : 400;

    try {
      const decoded = await verifyBearerToken(req.headers.authorization as string | undefined);
      const body = (req.body ?? {}) as SignBody;
      await logGarudaSignEvent({
        uid: decoded.uid,
        walletAddress: String(body.address ?? ""),
        method: String(body.method ?? "unknown"),
        status: "error",
        error: msg,
      });
    } catch {
      /* ignore audit failure */
    }

    return res.status(status).json({ error: msg });
  }
}
