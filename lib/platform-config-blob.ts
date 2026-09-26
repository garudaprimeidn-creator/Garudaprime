import { get, put } from "@vercel/blob";

/** Public JSON cache, readable when Firestore read quota is exhausted (writes still work). */
export const PLATFORM_PROGRAMS_BLOB_PATH = "platform/programs-cache.json";

export type PlatformProgramsBlobCache = {
  version?: number;
  updatedAt?: string;
  staking?: { products?: unknown[]; source?: string; updatedAt?: string | null };
  referral?: Record<string, unknown>;
  community?: {
    zakat?: { enabled?: boolean; nisabRateBps?: number; protocolFeeBps?: number };
    charity?: { enabled?: boolean; presetAmountsGat?: number[]; protocolFeeBps?: number };
    overview?: { members?: string; volume?: string; countries?: string };
    updatedAt?: string | null;
  };
  validator?: Record<string, unknown>;
  tokenPrices?: { prices?: Record<string, number>; source?: string; updatedAt?: string | null };
};

function blobToken(): string | null {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || null;
}

export async function readPlatformProgramsBlob(): Promise<PlatformProgramsBlobCache | null> {
  const token = blobToken();
  if (!token) return null;
  try {
    const result = await get(PLATFORM_PROGRAMS_BLOB_PATH, { access: "public", token });
    if (!result?.stream) return null;
    const text = await new Response(result.stream as ReadableStream).text();
    return JSON.parse(text) as PlatformProgramsBlobCache;
  } catch {
    return null;
  }
}

export async function writePlatformProgramsBlob(data: PlatformProgramsBlobCache): Promise<void> {
  const token = blobToken();
  if (!token) return;
  await put(PLATFORM_PROGRAMS_BLOB_PATH, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
    contentType: "application/json",
  });
}

export async function patchPlatformProgramsBlob(
  partial: Omit<PlatformProgramsBlobCache, "version" | "updatedAt">,
): Promise<void> {
  const token = blobToken();
  if (!token) return;
  const existing = (await readPlatformProgramsBlob()) ?? {};
  await writePlatformProgramsBlob({
    ...existing,
    ...partial,
    version: 1,
    updatedAt: new Date().toISOString(),
  });
}
