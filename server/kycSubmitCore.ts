import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import { verifyBearerToken } from "./payHubCore.js";

export type KycSubmitBody = {
  fullName?: string;
  email?: string;
  phone?: string;
  provider?: string;
  faceVerified?: boolean;
  livenessPassed?: boolean;
  livenessScore?: number;
  faceMatchScore?: number;
  ocrMatchScore?: number;
  domicile?: Record<string, unknown> | null;
  documentType?: string;
  hasIdDocument?: boolean;
  hasAddressProof?: boolean;
  hasKtpSelfie?: boolean;
  idDocumentUrl?: string | null;
  idDocumentFrontUrl?: string | null;
  idDocumentBackUrl?: string | null;
  ktpSelfieFrontUrl?: string | null;
  ktpSelfieBackUrl?: string | null;
  livenessSelfieUrl?: string | null;
  livenessStep1Url?: string | null;
  livenessStep2Url?: string | null;
  livenessStep3Url?: string | null;
  addressProofUrl?: string | null;
  riskScore?: number;
  addressVerification?: Record<string, unknown> | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) return value;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForFirestore(item)) as T;
  }
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) out[k] = sanitizeForFirestore(v);
  }
  return out as T;
}

export async function handleKycSubmit(
  authHeader: string | undefined,
  body: KycSubmitBody,
): Promise<{ ok: true; status: "pending" }> {
  const decoded = await verifyBearerToken(authHeader);
  const uid = decoded.uid;

  if (!body?.hasIdDocument || !body?.hasKtpSelfie) {
    throw new Error("Dokumen KYC belum lengkap");
  }
  if (!body.idDocumentFrontUrl || !body.ktpSelfieFrontUrl || !body.livenessSelfieUrl) {
    throw new Error("Upload dokumen belum selesai, tunggu hingga semua file terunggah");
  }

  const db = adminDb();
  const appBody = sanitizeForFirestore({
    uid,
    fullName: body.fullName ?? null,
    email: body.email ?? null,
    phone: body.phone ?? null,
    status: "pending",
    tier: 1,
    provider: body.provider ?? "GARUDA",
    faceVerified: !!body.faceVerified,
    livenessPassed: !!body.livenessPassed,
    livenessScore: body.livenessScore ?? 0,
    faceMatchScore: body.faceMatchScore ?? 0,
    ocrMatchScore: body.ocrMatchScore ?? 0,
    domicile: body.domicile ?? null,
    documentType: body.documentType ?? null,
    hasIdDocument: true,
    hasAddressProof: !!body.hasAddressProof,
    hasKtpSelfie: true,
    idDocumentUrl: body.idDocumentUrl ?? body.idDocumentFrontUrl,
    idDocumentFrontUrl: body.idDocumentFrontUrl,
    idDocumentBackUrl: body.idDocumentBackUrl ?? null,
    ktpSelfieFrontUrl: body.ktpSelfieFrontUrl,
    ktpSelfieBackUrl: body.ktpSelfieBackUrl ?? null,
    livenessSelfieUrl: body.livenessSelfieUrl ?? null,
    livenessStep1Url: body.livenessStep1Url ?? null,
    livenessStep2Url: body.livenessStep2Url ?? null,
    livenessStep3Url: body.livenessStep3Url ?? null,
    addressProofUrl: body.addressProofUrl ?? null,
    riskScore: body.riskScore ?? 0,
    addressVerification: body.addressVerification ?? null,
    rejectionReason: null,
    resubmitRequested: false,
    submittedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await db.collection("kyc_applications").doc(uid).set(appBody, { merge: true });

  await db.collection("kyc_verifications").add(sanitizeForFirestore({
    uid,
    status: "pending",
    tier: 1,
    provider: body.provider ?? "GARUDA",
    faceVerified: !!body.faceVerified,
    livenessPassed: !!body.livenessPassed,
    livenessScore: body.livenessScore ?? 0,
    faceMatchScore: body.faceMatchScore ?? 0,
    ocrMatchScore: body.ocrMatchScore ?? 0,
    domicile: body.domicile ?? null,
    hasIdDocument: true,
    hasAddressProof: !!body.hasAddressProof,
    hasKtpSelfie: true,
    idDocumentUrl: body.idDocumentUrl ?? body.idDocumentFrontUrl,
    idDocumentFrontUrl: body.idDocumentFrontUrl,
    idDocumentBackUrl: body.idDocumentBackUrl ?? null,
    ktpSelfieFrontUrl: body.ktpSelfieFrontUrl,
    ktpSelfieBackUrl: body.ktpSelfieBackUrl ?? null,
    livenessSelfieUrl: body.livenessSelfieUrl ?? null,
    livenessStep1Url: body.livenessStep1Url ?? null,
    livenessStep2Url: body.livenessStep2Url ?? null,
    livenessStep3Url: body.livenessStep3Url ?? null,
    addressProofUrl: body.addressProofUrl ?? null,
    addressVerification: body.addressVerification ?? null,
    submittedAt: FieldValue.serverTimestamp(),
  }));

  await db.collection("users").doc(uid).set(sanitizeForFirestore({
    kycStatus: "pending",
    kycTier: 1,
    kycRejectionReason: null,
    kycResubmitRequired: false,
    kycFaceVerified: !!body.faceVerified,
    kycLivenessPassed: !!body.livenessPassed,
    kycLivenessScore: body.livenessScore ?? 0,
    kycFaceMatchScore: body.faceMatchScore ?? 0,
    kycOcrMatchScore: body.ocrMatchScore ?? 0,
    kycRiskScore: body.riskScore ?? 0,
    updatedAt: FieldValue.serverTimestamp(),
  }), { merge: true });

  return { ok: true, status: "pending" };
}

export function kycSubmitErrorStatus(message: string): number {
  if (message === "Unauthorized" || message.includes("Unauthorized")) return 401;
  if (message.includes("belum lengkap") || message.includes("belum selesai")) return 400;
  if (message.includes("FIREBASE_SERVICE_ACCOUNT")) return 503;
  return 500;
}
