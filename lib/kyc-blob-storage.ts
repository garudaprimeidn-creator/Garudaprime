import { get } from "@vercel/blob";

export type KycBlobKind =
  | "id-document-front"
  | "id-document-back"
  | "address-proof"
  | "ktp-selfie-front"
  | "ktp-selfie-back"
  | "liveness-selfie"
  | "liveness-step-1"
  | "liveness-step-2"
  | "liveness-step-3";

const BLOB_HOST = "blob.vercel-storage.com";

export function isVercelBlobUrl(url: string | null | undefined): boolean {
  if (!url?.startsWith("http")) return false;
  try {
    return new URL(url).hostname.includes(BLOB_HOST);
  } catch {
    return false;
  }
}

export function blobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN belum dikonfigurasi. Aktifkan Blob di Vercel → Storage → Connect to Project.",
    );
  }
  return token;
}

export function kycBlobPathname(uid: string, kind: KycBlobKind, ext: string): string {
  return `kyc/${uid}/${kind}.${ext}`;
}

export async function downloadVercelBlob(
  url: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const result = await get(url, {
    access: "private",
    token: blobToken(),
    useCache: false,
  });
  if (!result || result.statusCode === 304 || !result.stream) {
    throw new Error("Dokumen tidak ditemukan di Vercel Blob");
  }
  const chunks: Uint8Array[] = [];
  const reader = result.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return {
    buffer,
    contentType: result.blob.contentType ?? "application/octet-stream",
  };
}
