/**
 * Auto-provision Garuda Native Wallet after KYC (optional hook).
 * Call from KYC approval handlers when GARUDA_WALLET_AUTO_ON_KYC=true.
 */
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import {
  ensureGarudaWalletForUser,
  GARUDA_NATIVE_PROVIDER,
  isGarudaNativeWalletEnabled,
  isGarudaWalletAutoOnKyc,
} from "./garudaWalletCore.js";

export type ProvisionGarudaWalletOptions = {
  /** Email OTP verified, allow wallet creation before KYC (registration step 3). */
  skipKycCheck?: boolean;
};

export async function provisionGarudaWalletAfterKyc(
  uid: string,
  options?: ProvisionGarudaWalletOptions,
): Promise<{
  provisioned: boolean;
  address?: string;
}> {
  if (!isGarudaNativeWalletEnabled()) {
    return { provisioned: false };
  }

  const record = await ensureGarudaWalletForUser(uid, {
    skipKycCheck: options?.skipKycCheck,
  });
  const db = adminDb();
  const nativeAddr = record.walletAddress.toLowerCase();

  const userSnap = await db.collection("users").doc(uid).get();
  const existingPrimary = String(userSnap.data()?.walletAddress ?? "").trim().toLowerCase();
  const shouldSetProfilePrimary = !existingPrimary || existingPrimary === nativeAddr;

  if (shouldSetProfilePrimary) {
    await db.collection("users").doc(uid).set({
      walletAddress: record.walletAddress,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  const existing = await db.collection("connected_wallets")
    .where("uid", "==", uid)
    .where("walletAddress", "==", record.walletAddress)
    .limit(1)
    .get();

  if (existing.empty) {
    await db.collection("connected_wallets").add({
      uid,
      walletAddress: record.walletAddress,
      walletType: GARUDA_NATIVE_PROVIDER,
      network: record.network,
      isPrimary: shouldSetProfilePrimary,
      connectedAt: FieldValue.serverTimestamp(),
      lastUsed: FieldValue.serverTimestamp(),
    });
  }

  return { provisioned: true, address: record.walletAddress };
}
