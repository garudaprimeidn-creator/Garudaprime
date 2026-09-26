/**
 * Fase 4, embedded wallet (MPC/AA vendor). Server-side config & binding audit.
 */
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import { getWalletActivationPublicConfig } from "./walletActivationCore.js";
import { isGarudaNativeWalletEnabled } from "./garudaWalletCore.js";

export type EmbeddedWalletVendor = "garuda" | "none";

const BINDINGS_COL = "embedded_wallet_bindings";

export function embeddedWalletVendor(): EmbeddedWalletVendor {
  const raw = (
    process.env.EMBEDDED_WALLET_PROVIDER
    || process.env.VITE_EMBEDDED_WALLET_PROVIDER
  )?.trim().toLowerCase();
  if (raw === "garuda") return "garuda";
  return "none";
}

export function isEmbeddedWalletServerEnabled(): boolean {
  const vendor = embeddedWalletVendor();
  if (vendor === "garuda") return isGarudaNativeWalletEnabled();
  if (vendor === "none") return false;
  const appId =
    process.env.EMBEDDED_WALLET_APP_ID?.trim()
    || process.env.VITE_EMBEDDED_WALLET_APP_ID?.trim();
  return Boolean(appId);
}

export function isRelayerPaymasterEnabled(): boolean {
  const raw = process.env.RELAYER_PAYMASTER_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export function relayerMaxGasSponsorPerDay(): number {
  const n = Number(process.env.RELAYER_MAX_GAS_SPONSOR_PER_DAY ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function embeddedWalletProviderType(vendor: EmbeddedWalletVendor): string {
  if (vendor === "garuda") return "embedded:garuda";
  return vendor === "none" ? "embedded" : `embedded:${vendor}`;
}

function normalizeAddress(address: string): string {
  const v = address.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(v)) {
    throw new Error("Invalid wallet address");
  }
  return v;
}

export function getEmbeddedWalletPublicConfig() {
  const vendor = embeddedWalletVendor();
  const appId =
    process.env.VITE_EMBEDDED_WALLET_APP_ID?.trim()
    || process.env.EMBEDDED_WALLET_APP_ID?.trim()
    || null;
  return {
    enabled: vendor === "garuda"
      ? isGarudaNativeWalletEnabled()
      : vendor !== "none" && Boolean(appId),
    vendor,
    appId: appId ? `${appId.slice(0, 6)}…` : null,
    paymasterEnabled: isRelayerPaymasterEnabled(),
    chainId: Number(process.env.VITE_SIDRA_CHAIN_ID) || 97453,
    walletActivation: getWalletActivationPublicConfig(),
  };
}

/** Catat binding uid ↔ address (audit; dompet utama tetap di connected_wallets). */
export async function recordEmbeddedWalletBinding(input: {
  uid: string;
  address: string;
  vendor?: EmbeddedWalletVendor;
  externalUserId?: string;
}): Promise<{ bindingId: string }> {
  if (!isEmbeddedWalletServerEnabled()) {
    throw new Error("Embedded wallet not enabled on server");
  }
  const vendor = input.vendor ?? embeddedWalletVendor();
  const walletAddress = normalizeAddress(input.address);
  const ref = adminDb().collection(BINDINGS_COL).doc();
  await ref.set({
    uid: input.uid,
    walletAddress,
    vendor,
    providerType: embeddedWalletProviderType(vendor),
    externalUserId: input.externalUserId?.trim() || null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { bindingId: ref.id };
}
