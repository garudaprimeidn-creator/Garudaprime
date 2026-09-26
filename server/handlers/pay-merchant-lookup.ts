import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, handleOptions } from "../vercelCors.js";
import { adminDb } from "../firebaseAdmin.js";
import {
  personalMerchantIdForUid,
  resolveMerchantVaultAddress,
  type MerchantDoc,
} from "../merchantLedgerCore.js";
import { resolveUidFromWalletAddress } from "../walletIdentityCore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req.method, res)) return;
  applyCors(res);

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const merchantIdRaw = typeof req.query.merchantId === "string" ? req.query.merchantId.trim() : "";
    const vaultRaw = typeof req.query.vault === "string" ? req.query.vault.trim() : "";

    let merchantId = merchantIdRaw.toUpperCase();
    if (!merchantId && vaultRaw.startsWith("0x")) {
      const ownerUid = await resolveUidFromWalletAddress(vaultRaw);
      if (!ownerUid) {
        res.status(404).json({ error: "Merchant not found for vault" });
        return;
      }
      merchantId = personalMerchantIdForUid(ownerUid);
    }

    if (!/^GP-(?:MRT|USR)-[A-Z0-9-]+$/.test(merchantId)) {
      res.status(400).json({ error: "Invalid merchant ID" });
      return;
    }

    const snap = await adminDb().collection("pay_merchants").doc(merchantId).get();
    const merchant: MerchantDoc = snap.exists
      ? (snap.data() as MerchantDoc)
      : {
        name: "Garuda Merchant",
        verified: true,
        walletAddress: vaultRaw.startsWith("0x") ? vaultRaw : null,
        ownerUid: null,
        gatBalance: 0,
      };

    const walletAddress = await resolveMerchantVaultAddress(merchant, merchantId);

    res.status(200).json({
      merchantId,
      name: merchant.name ?? "Garuda Merchant",
      walletAddress,
      verified: Boolean(merchant.verified),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Merchant lookup failed";
    res.status(404).json({ error: message });
  }
}
