/**
 * Fase 4, embedded wallet feature flags (vendor TBD).
 * @see docs/adr/004-embedded-wallet-foundation.md
 */

export type EmbeddedWalletProvider = "garuda" | "none";

export function embeddedWalletProvider(): EmbeddedWalletProvider {
  const raw = import.meta.env.VITE_EMBEDDED_WALLET_PROVIDER?.trim().toLowerCase();
  if (raw === "garuda") return "garuda";
  return "none";
}

export function isGarudaNativeWalletClientEnabled(): boolean {
  const provider = embeddedWalletProvider();
  if (provider !== "garuda") return false;
  const raw = import.meta.env.VITE_GARUDA_NATIVE_WALLET_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export function isEmbeddedWalletEnabled(): boolean {
  const provider = embeddedWalletProvider();
  if (provider === "garuda") return isGarudaNativeWalletClientEnabled();
  return (
    provider !== "none"
    && Boolean(import.meta.env.VITE_EMBEDDED_WALLET_APP_ID?.trim())
  );
}

export function embeddedWalletAppId(): string | null {
  const id = import.meta.env.VITE_EMBEDDED_WALLET_APP_ID?.trim();
  return id || null;
}

export function isEmbeddedWalletDemoMode(): boolean {
  const raw = import.meta.env.VITE_EMBEDDED_WALLET_DEMO?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export function isRelayerPaymasterEnabled(): boolean {
  const raw = import.meta.env.VITE_RELAYER_PAYMASTER_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

const PROVIDER_LABELS: Record<EmbeddedWalletProvider, string> = {
  garuda: "Garuda Prime",
  none: "Garuda Wallet",
};

export function embeddedWalletProviderLabel(
  provider: EmbeddedWalletProvider = embeddedWalletProvider(),
): string {
  return PROVIDER_LABELS[provider];
}

export async function fetchEmbeddedWalletServerConfig(
  apiBase: string,
): Promise<{ enabled: boolean; vendor: string; paymasterEnabled: boolean } | null> {
  try {
    const base = apiBase.replace(/\/$/, "");
    const res = await fetch(`${base}/wallet/embedded/config`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
