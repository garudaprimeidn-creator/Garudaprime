import { getStorage } from "firebase-admin/storage";

export const COMMUNITY_CONFIG_STORAGE_PATH = "platform/community-program.json";

export type CommunityConfigPayload = {
  zakat?: { enabled?: boolean; nisabRateBps?: number; protocolFeeBps?: number };
  charity?: { enabled?: boolean; presetAmountsGat?: number[]; protocolFeeBps?: number };
  overview?: { members?: string; volume?: string; countries?: string };
};

function bucketName(): string | undefined {
  return (
    process.env.VITE_FIREBASE_STORAGE_BUCKET
    || process.env.FIREBASE_STORAGE_BUCKET
    || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    || (process.env.VITE_FIREBASE_PROJECT_ID
      ? `${process.env.VITE_FIREBASE_PROJECT_ID}.firebasestorage.app`
      : undefined)
  );
}

export function communityConfigPublicUrl(): string | null {
  const bucket = bucketName();
  if (!bucket) return null;
  return `https://storage.googleapis.com/${bucket}/${COMMUNITY_CONFIG_STORAGE_PATH}`;
}

export async function uploadCommunityConfigStorage(
  app: { storageBucket?: string },
  config: CommunityConfigPayload,
): Promise<string | null> {
  const bucket = getStorage(app).bucket();
  const file = bucket.file(COMMUNITY_CONFIG_STORAGE_PATH);
  await file.save(JSON.stringify(config), {
    contentType: "application/json",
    metadata: { cacheControl: "public, max-age=30" },
    resumable: false,
  });
  try {
    await file.makePublic();
  } catch {
    /* uniform bucket-level access may already be public */
  }
  return communityConfigPublicUrl();
}

export async function readCommunityConfigStorage(app: { storageBucket?: string }): Promise<CommunityConfigPayload | null> {
  try {
    const bucket = getStorage(app).bucket();
    const [buf] = await bucket.file(COMMUNITY_CONFIG_STORAGE_PATH).download();
    return JSON.parse(buf.toString("utf8")) as CommunityConfigPayload;
  } catch {
    return null;
  }
}

export async function fetchCommunityConfigPublic(): Promise<CommunityConfigPayload | null> {
  const url = communityConfigPublicUrl();
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as CommunityConfigPayload;
  } catch {
    return null;
  }
}
