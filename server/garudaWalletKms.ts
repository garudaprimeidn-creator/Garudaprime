/**
 * Master secret resolution for Garuda Native Wallet.
 * Default: GARUDA_WALLET_MASTER_SECRET env (dev/staging).
 * Production: set GARUDA_WALLET_KMS_PROVIDER=google and GCP KMS env vars.
 */
import { createHash } from "node:crypto";

export type GarudaKmsProvider = "env" | "google";

export function garudaKmsProvider(): GarudaKmsProvider {
  const raw = process.env.GARUDA_WALLET_KMS_PROVIDER?.trim().toLowerCase();
  if (raw === "google" || raw === "gcp") return "google";
  return "env";
}

function envMasterSecret(): string {
  const secret = process.env.GARUDA_WALLET_MASTER_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("GARUDA_WALLET_MASTER_SECRET not configured (min 32 chars)");
  }
  return secret;
}

async function googleKmsMasterSecret(): Promise<string> {
  const ciphertextB64 = process.env.GARUDA_WALLET_KMS_CIPHERTEXT_B64?.trim();
  if (!ciphertextB64) {
    throw new Error("GARUDA_WALLET_KMS_CIPHERTEXT_B64 required for google KMS provider");
  }

  const projectId = process.env.GARUDA_WALLET_KMS_PROJECT_ID?.trim()
    || process.env.GOOGLE_CLOUD_PROJECT?.trim()
    || process.env.GCP_PROJECT?.trim();
  const location = process.env.GARUDA_WALLET_KMS_LOCATION?.trim() || "global";
  const keyRing = process.env.GARUDA_WALLET_KMS_KEY_RING?.trim();
  const keyName = process.env.GARUDA_WALLET_KMS_KEY_NAME?.trim();
  const keyVersion = process.env.GARUDA_WALLET_KMS_KEY_VERSION?.trim() || "1";

  if (!projectId || !keyRing || !keyName) {
    throw new Error(
      "Google KMS not configured, set GARUDA_WALLET_KMS_PROJECT_ID, GARUDA_WALLET_KMS_KEY_RING, GARUDA_WALLET_KMS_KEY_NAME",
    );
  }

  let KeyManagementServiceClient: new () => {
    decrypt: (req: {
      name: string;
      ciphertext: Buffer;
    }) => Promise<[{ plaintext?: Buffer | Uint8Array | null }]>;
  };

  try {
    const mod = await import("@google-cloud/kms");
    KeyManagementServiceClient = mod.KeyManagementServiceClient as typeof KeyManagementServiceClient;
  } catch {
    throw new Error(
      "Google KMS provider selected but @google-cloud/kms is not installed",
    );
  }

  const client = new KeyManagementServiceClient();
  const name = `projects/${projectId}/locations/${location}/keyRings/${keyRing}/cryptoKeys/${keyName}/cryptoKeyVersions/${keyVersion}`;
  const [result] = await client.decrypt({
    name,
    ciphertext: Buffer.from(ciphertextB64, "base64"),
  });

  const plaintext = result.plaintext;
  if (!plaintext?.length) {
    throw new Error("Google KMS decrypt returned empty plaintext");
  }

  const secret = Buffer.from(plaintext).toString("utf8").trim();
  if (secret.length < 32) {
    throw new Error("Decrypted Garuda wallet master secret is too short");
  }
  return secret;
}

let cachedSecret: string | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Resolve wallet master secret (cached 5 min for KMS round-trips). */
export async function resolveGarudaWalletMasterSecret(): Promise<string> {
  const now = Date.now();
  if (cachedSecret && now < cacheExpiresAt) return cachedSecret;

  const secret = garudaKmsProvider() === "google"
    ? await googleKmsMasterSecret()
    : envMasterSecret();

  cachedSecret = secret;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return secret;
}

/** Sync helper for derive path, uses env only when KMS is async google (pre-warm at boot). */
export function resolveGarudaWalletMasterSecretSync(): string {
  if (garudaKmsProvider() === "google") {
    if (cachedSecret) return cachedSecret;
    throw new Error("Google KMS secret not warmed, call resolveGarudaWalletMasterSecret() first");
  }
  return envMasterSecret();
}

export function fingerprintGarudaKmsConfig(): string {
  const provider = garudaKmsProvider();
  if (provider === "env") {
    const secret = process.env.GARUDA_WALLET_MASTER_SECRET?.trim() ?? "";
    return `env:${createHash("sha256").update(secret).digest("hex").slice(0, 12)}`;
  }
  const ring = process.env.GARUDA_WALLET_KMS_KEY_RING?.trim() ?? "";
  const key = process.env.GARUDA_WALLET_KMS_KEY_NAME?.trim() ?? "";
  return `google:${ring}/${key}`;
}
