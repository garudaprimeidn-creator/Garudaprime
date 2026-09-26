import { put } from "@vercel/blob";
import {
  blobToken,
  kycBlobPathname,
  type KycBlobKind,
} from "../lib/kyc-blob-storage.js";
import { verifyBearerToken } from "./payHubCore.js";

export type KycUploadKind = KycBlobKind;

export type KycUploadBody = {
  kind: KycUploadKind;
  dataUrl: string;
};

const VALID_KINDS = new Set<KycUploadKind>([
  "id-document-front",
  "id-document-back",
  "address-proof",
  "ktp-selfie-front",
  "ktp-selfie-back",
  "liveness-selfie",
  "liveness-step-1",
  "liveness-step-2",
  "liveness-step-3",
]);

/** Vercel serverless request body limit is 4.5 MB */
const MAX_BYTES = 4 * 1024 * 1024;

function mimeFromDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);/);
  return m?.[1] ?? "application/octet-stream";
}

function extFromMime(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } {
  const contentType = mimeFromDataUrl(dataUrl);
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Format data URL tidak valid");
  const buffer = Buffer.from(base64, "base64");
  return { buffer, contentType };
}

export async function uploadKycDocumentAdmin(
  uid: string,
  kind: KycUploadKind,
  dataUrl: string,
): Promise<string> {
  if (!VALID_KINDS.has(kind)) throw new Error("Jenis dokumen tidak valid");
  if (!dataUrl.startsWith("data:")) throw new Error("Format file tidak valid");

  const { buffer, contentType } = dataUrlToBuffer(dataUrl);
  if (buffer.length > MAX_BYTES) {
    throw new Error("File terlalu besar (max 4MB). Ambil ulang foto dengan jarak lebih dekat.");
  }
  if (!contentType.startsWith("image/") && contentType !== "application/pdf") {
    throw new Error("Hanya foto (JPEG/PNG) atau PDF yang diizinkan");
  }

  const ext = extFromMime(contentType);
  const pathname = kycBlobPathname(uid, kind, ext);

  const blob = await put(pathname, buffer, {
    access: "private",
    token: blobToken(),
    contentType,
    allowOverwrite: true,
    addRandomSuffix: false,
  });

  return blob.url;
}

export async function handleKycUpload(
  authHeader: string | undefined,
  body: KycUploadBody,
): Promise<{ url: string }> {
  const decoded = await verifyBearerToken(authHeader);
  if (!body?.kind || !body?.dataUrl) throw new Error("Payload tidak lengkap");
  const url = await uploadKycDocumentAdmin(decoded.uid, body.kind, body.dataUrl);
  return { url };
}

export function kycUploadErrorStatus(message: string): number {
  if (message === "Unauthorized" || message.includes("Unauthorized")) return 401;
  if (message.includes("tidak valid") || message.includes("Payload")) return 400;
  if (message.includes("terlalu besar")) return 413;
  if (message.includes("BLOB_READ_WRITE_TOKEN") || message.includes("belum dikonfigurasi")) return 503;
  return 500;
}
