import { auth, isFirebaseConfigured } from "../firebase/config";
import { resolveFirebaseUploadUid } from "../firebase/waitForAuthUser";
import { prepareKycImageForUpload, type KycImagePreset } from "./kycImagePrep";
import { uploadKycViaServerApi } from "./kycUploadApi";

export type KycUploadKind =
  | "id-document-front"
  | "id-document-back"
  | "address-proof"
  | "ktp-selfie-front"
  | "ktp-selfie-back"
  | "liveness-selfie"
  | "liveness-step-1"
  | "liveness-step-2"
  | "liveness-step-3";

const MAX_BYTES = 4 * 1024 * 1024;

const KIND_LABELS: Record<KycUploadKind, string> = {
  "id-document-front": "Identitas depan",
  "id-document-back": "Identitas belakang",
  "address-proof": "Bukti domisili",
  "ktp-selfie-front": "Selfie + dokumen depan",
  "ktp-selfie-back": "Selfie + dokumen belakang",
  "liveness-selfie": "Selfie active liveness",
  "liveness-step-1": "Liveness point 1 (ekspresi)",
  "liveness-step-2": "Liveness point 2 (putar kepala)",
  "liveness-step-3": "Liveness point 3 (kedip)",
};

const KIND_PRESET: Record<KycUploadKind, KycImagePreset> = {
  "id-document-front": "id-document",
  "id-document-back": "id-document",
  "address-proof": "id-document",
  "ktp-selfie-front": "selfie",
  "ktp-selfie-back": "selfie",
  "liveness-selfie": "selfie",
  "liveness-step-1": "selfie",
  "liveness-step-2": "selfie",
  "liveness-step-3": "selfie",
};

export type KycUploadProgressCallback = (info: {
  step: number;
  total: number;
  label: string;
  phase: "compress" | "upload";
}) => void;

function mapUploadError(label: string, err: unknown): Error {
  const raw = err instanceof Error ? err.message : "Upload gagal";
  if (raw.includes("Sesi Firebase") || raw.includes("login ulang") || raw.includes("Unauthorized")) {
    return new Error(`${label}: sesi habis. Silakan login ulang.`);
  }
  if (raw.includes("retry-limit-exceeded") || raw.includes("network") || raw.includes("timeout")) {
    return new Error(`${label}: koneksi tidak stabil. Gunakan WiFi atau sinyal lebih kuat.`);
  }
  if (raw.includes("Upload terlalu lama") || raw.includes("Upload timeout")) {
    return new Error(`${label}: ${raw}`);
  }
  if (raw.includes("BLOB_READ_WRITE_TOKEN") || raw.includes("terlalu besar")) {
    return new Error(`${label}: ${raw}`);
  }
  return new Error(`${label}: ${raw}`);
}

async function uploadPreparedDataUrl(
  kind: KycUploadKind,
  prepared: string,
): Promise<string> {
  const label = KIND_LABELS[kind];
  if (prepared.length > MAX_BYTES * 1.4) {
    throw new Error(`${label}: file terlalu besar (max 4MB). Ambil ulang foto dengan jarak lebih dekat.`);
  }
  return uploadKycViaServerApi(kind, prepared);
}

/** Upload base64 data URL via Vercel Blob (server); throws on failure. */
export async function uploadKycDocument(
  uid: string,
  kind: KycUploadKind,
  dataUrl: string,
  onPhase?: (phase: "compress" | "upload") => void,
  alreadyCompressed = false,
): Promise<string> {
  const label = KIND_LABELS[kind];
  if (!isFirebaseConfigured || !auth) {
    throw new Error(`${label}: autentikasi belum siap. Login ulang.`);
  }
  if (!dataUrl.startsWith("data:")) {
    throw new Error(`${label}: format file tidak valid.`);
  }

  await resolveFirebaseUploadUid(uid);
  const preset = KIND_PRESET[kind];

  try {
    onPhase?.("upload");
    let prepared = alreadyCompressed
      ? dataUrl
      : await prepareKycImageForUpload(dataUrl, preset, false, true);
    try {
      return await uploadPreparedDataUrl(kind, prepared);
    } catch {
      onPhase?.("compress");
      prepared = await prepareKycImageForUpload(dataUrl, preset, true);
      onPhase?.("upload");
      return await uploadPreparedDataUrl(kind, prepared);
    }
  } catch (err) {
    throw mapUploadError(label, err);
  }
}

export async function uploadKycIdDocuments(
  uid: string,
  idDocumentFront: string | null,
  idDocumentBack: string | null,
  onProgress?: KycUploadProgressCallback,
): Promise<{
  idDocumentFrontUrl: string;
  idDocumentBackUrl: string;
  idDocumentUrl: string;
}> {
  if (!idDocumentFront || !idDocumentBack) {
    throw new Error("Foto identitas depan dan belakang wajib diunggah");
  }

  onProgress?.({ step: 1, total: 4, label: KIND_LABELS["id-document-front"], phase: "compress" });
  const idDocumentFrontUrl = await uploadKycDocument(uid, "id-document-front", idDocumentFront, (phase) => {
    onProgress?.({ step: 1, total: 4, label: KIND_LABELS["id-document-front"], phase });
  });

  onProgress?.({ step: 2, total: 4, label: KIND_LABELS["id-document-back"], phase: "compress" });
  const idDocumentBackUrl = await uploadKycDocument(uid, "id-document-back", idDocumentBack, (phase) => {
    onProgress?.({ step: 2, total: 4, label: KIND_LABELS["id-document-back"], phase });
  });

  return {
    idDocumentFrontUrl,
    idDocumentBackUrl,
    idDocumentUrl: idDocumentFrontUrl,
  };
}

/** @deprecated Use uploadKycIdDocuments */
export async function uploadKycDocuments(
  uid: string,
  idDocument: string | null,
  addressProof: string | null,
): Promise<{ idDocumentUrl: string | null; addressProofUrl: string | null }> {
  const front = idDocument
    ? await uploadKycDocument(uid, "id-document-front", idDocument)
    : null;
  const addressProofUrl = addressProof
    ? await uploadKycDocument(uid, "address-proof", addressProof)
    : null;
  return { idDocumentUrl: front, addressProofUrl };
}

export async function uploadKycSelfies(
  uid: string,
  ktpSelfieFront: string | null,
  ktpSelfieBack: string | null,
  onProgress?: KycUploadProgressCallback,
  stepOffset = 2,
): Promise<{ ktpSelfieFrontUrl: string; ktpSelfieBackUrl: string }> {
  if (!ktpSelfieFront || !ktpSelfieBack) {
    throw new Error("Selfie + dokumen depan dan belakang wajib diunggah");
  }

  const total = 4;
  onProgress?.({ step: stepOffset + 1, total, label: KIND_LABELS["ktp-selfie-front"], phase: "compress" });
  const ktpSelfieFrontUrl = await uploadKycDocument(uid, "ktp-selfie-front", ktpSelfieFront, (phase) => {
    onProgress?.({ step: stepOffset + 1, total, label: KIND_LABELS["ktp-selfie-front"], phase });
  });

  onProgress?.({ step: stepOffset + 2, total, label: KIND_LABELS["ktp-selfie-back"], phase: "compress" });
  const ktpSelfieBackUrl = await uploadKycDocument(uid, "ktp-selfie-back", ktpSelfieBack, (phase) => {
    onProgress?.({ step: stepOffset + 2, total, label: KIND_LABELS["ktp-selfie-back"], phase });
  });

  return { ktpSelfieFrontUrl, ktpSelfieBackUrl };
}

export async function uploadAllKycDocuments(
  uid: string,
  docs: {
    idDocumentFront: string;
    idDocumentBack: string;
    ktpSelfieFront: string;
    ktpSelfieBack: string;
  },
  onProgress?: KycUploadProgressCallback,
): Promise<{
  idDocumentFrontUrl: string;
  idDocumentBackUrl: string;
  idDocumentUrl: string;
  ktpSelfieFrontUrl: string;
  ktpSelfieBackUrl: string;
}> {
  const idDocs = await uploadKycIdDocuments(uid, docs.idDocumentFront, docs.idDocumentBack, onProgress);
  const selfies = await uploadKycSelfies(uid, docs.ktpSelfieFront, docs.ktpSelfieBack, onProgress, 2);
  return { ...idDocs, ...selfies };
}

export { prepareKycImageForUpload };
