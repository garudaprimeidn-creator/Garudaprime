/**
 * Fase 4, Garuda embedded wallet (vendor SDK di-mount saat App ID tersedia).
 */
import { isDemoAuthAllowed } from "../env/production";
import {
  embeddedWalletProvider,
  embeddedWalletAppId,
  isEmbeddedWalletEnabled,
  isEmbeddedWalletDemoMode,
  isGarudaNativeWalletClientEnabled,
  embeddedWalletProviderLabel,
} from "./embeddedWalletConfig";
import { auth as firebaseAuth } from "../firebase/config";
import { createGarudaNativeWallet } from "./garudaWalletApi";
import { fetchExistingGarudaWalletAddress } from "./garudaNativeProvision";
import { GARUDA_NATIVE_PROVIDER } from "./garudaWalletBridge";
import { saveConnectedWallet } from "../firebase/firestoreService";
import { normalizeWalletAddress } from "./connectedWalletUtils";
import { saveAddressProviderLock } from "./primaryWalletLock";
import { cacheGarudaServerAddress, resolveGarudaServerAddress, clearGarudaServerAddressCache } from "./garudaNativeSession";

export type EmbeddedConnectResult = {
  address: string;
  provider: string;
  vendor: ReturnType<typeof embeddedWalletProvider>;
};

export function embeddedWalletNotReadyMessage(): string {
  const vendor = embeddedWalletProvider();
  if (vendor === "none") return "Garuda Wallet belum diaktifkan";
  if (!embeddedWalletAppId()) return "Garuda Wallet: App ID vendor belum dikonfigurasi";
  return "Garuda Wallet: integrasi SDK vendor belum dipasang";
}

/** Demo: alamat deterministik dari uid (hanya dev / demo auth). */
export function demoEmbeddedAddressForUid(uid: string): string {
  const hex = Array.from(uid)
    .reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
    .toString(16)
    .replace(/-/g, "")
    .padStart(40, "0")
    .slice(-40);
  return normalizeWalletAddress(`0x${hex}`);
}

export async function connectEmbeddedWallet(
  uid: string,
  options?: { otpSession?: string },
): Promise<EmbeddedConnectResult> {
  const vendor = embeddedWalletProvider();
  if (!isEmbeddedWalletEnabled() && !(isEmbeddedWalletDemoMode() && isDemoAuthAllowed())) {
    throw Object.assign(new Error(embeddedWalletNotReadyMessage()), {
      code: "embedded/not-ready",
    });
  }

  if (isEmbeddedWalletDemoMode() && isDemoAuthAllowed()) {
    const address = demoEmbeddedAddressForUid(uid);
    await saveConnectedWallet(
      uid,
      { address, provider: `embedded:${vendor}`, network: "SDA Sidra Network" },
      { makePrimary: true },
    );
    return { address, provider: `embedded:${vendor}`, vendor };
  }

  if (vendor === "garuda" && isGarudaNativeWalletClientEnabled()) {
    const fbUser = firebaseAuth?.currentUser;
    if (!fbUser) {
      throw Object.assign(new Error("Login diperlukan untuk Garuda Wallet"), { code: "embedded/auth-required" });
    }
    const idToken = await fbUser.getIdToken();
    let garudaNetwork = "SDA Sidra Network";
    let rawAddress: string;

    if (options?.otpSession) {
      rawAddress = await resolveGarudaServerAddress(async () => {
        const result = await createGarudaNativeWallet(idToken, options.otpSession);
        garudaNetwork = result.network || garudaNetwork;
        return result.address ?? "";
      });
    } else {
      const existing = await fetchExistingGarudaWalletAddress(uid);
      if (!existing) {
        throw Object.assign(
          new Error("Verifikasi OTP dompet diperlukan sebelum membuat dompet Garuda Prime"),
          { code: "garuda/otp-required" },
        );
      }
      rawAddress = existing;
      cacheGarudaServerAddress(existing);
    }

    const address = normalizeWalletAddress(rawAddress);
    if (!address) {
      throw Object.assign(new Error("Garuda wallet address tidak valid"), {
        code: "embedded/invalid-address",
      });
    }
    try {
      await saveConnectedWallet(
        uid,
        { address, provider: GARUDA_NATIVE_PROVIDER, network: garudaNetwork },
        { makePrimary: true },
      );
      saveAddressProviderLock(address, GARUDA_NATIVE_PROVIDER, GARUDA_NATIVE_PROVIDER);
    } catch (err) {
      // Server may have already linked the wallet, don't block registration on client sync.
      console.warn("[connectEmbeddedWallet] client wallet sync failed", err);
      cacheGarudaServerAddress(address);
    }
    return { address, provider: GARUDA_NATIVE_PROVIDER, vendor: "garuda" };
  }

  throw Object.assign(new Error(embeddedWalletNotReadyMessage()), {
    code: "embedded/sdk-not-integrated",
  });
}

export { embeddedWalletProviderLabel, isEmbeddedWalletEnabled, isEmbeddedWalletDemoMode };
