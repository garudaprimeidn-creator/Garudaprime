import {
  doc, setDoc, getDoc, collection, addDoc, serverTimestamp, updateDoc,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import type { KycStatus } from "../firebase/firestoreService";
import type { KycAddress } from "../merchant/kycAddress";
import type { AddressVerificationResult } from "./addressVerification";
import { isKycServerSubmitAvailable, submitKycViaServerApi } from "./kycSubmitApi";

export type KycApplication = {
  uid: string;
  fullName?: string;
  email?: string;
  phone?: string;
  status: KycStatus | string;
  tier: number;
  provider: string;
  faceVerified: boolean;
  livenessPassed: boolean;
  livenessScore?: number;
  faceMatchScore?: number;
  ocrMatchScore?: number;
  verificationHash?: string | null;
  domicile?: KycAddress | null;
  documentType?: string;
  hasIdDocument: boolean;
  hasAddressProof: boolean;
  idDocumentUrl?: string | null;
  idDocumentFrontUrl?: string | null;
  idDocumentBackUrl?: string | null;
  addressProofUrl?: string | null;
  ktpSelfieFrontUrl?: string | null;
  ktpSelfieBackUrl?: string | null;
  livenessSelfieUrl?: string | null;
  livenessStep1Url?: string | null;
  livenessStep2Url?: string | null;
  livenessStep3Url?: string | null;
  hasKtpSelfie?: boolean;
  riskScore?: number;
  addressVerification?: AddressVerificationResult | null;
  submittedAt?: unknown;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
};

const demoApplications: Record<string, KycApplication> = {};

/** Firestore rejects undefined, strip recursively; preserve FieldValue/Timestamp. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function sanitizeForFirestore<T>(value: T): T {
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

export async function submitKycApplication(
  uid: string,
  data: Omit<KycApplication, "uid" | "submittedAt">,
): Promise<void> {
  const payload: KycApplication = sanitizeForFirestore({
    ...data,
    uid,
    status: "pending",
    tier: 1,
  });

  if (!isFirebaseConfigured || !db) {
    demoApplications[uid] = { ...payload, submittedAt: Date.now() };
    return;
  }

  if (isKycServerSubmitAvailable()) {
    await submitKycViaServerApi(data);
    return;
  }

  const appRef = doc(db, "kyc_applications", uid);
  const appSnap = await getDoc(appRef);
  const appBody = sanitizeForFirestore({
    ...payload,
    rejectionReason: null,
    resubmitRequested: false,
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (appSnap.exists()) {
    await setDoc(appRef, appBody, { merge: true });
  } else {
    await setDoc(appRef, appBody);
  }

  await addDoc(collection(db, "kyc_verifications"), sanitizeForFirestore({
    uid,
    status: "pending",
    tier: 1,
    provider: data.provider,
    faceVerified: data.faceVerified,
    livenessPassed: data.livenessPassed,
    livenessScore: data.livenessScore ?? 0,
    faceMatchScore: data.faceMatchScore ?? 0,
    ocrMatchScore: data.ocrMatchScore ?? 0,
    domicile: data.domicile ?? null,
    hasIdDocument: data.hasIdDocument,
    hasAddressProof: data.hasAddressProof,
    hasKtpSelfie: data.hasKtpSelfie ?? false,
    idDocumentUrl: data.idDocumentUrl ?? null,
    idDocumentFrontUrl: data.idDocumentFrontUrl ?? null,
    idDocumentBackUrl: data.idDocumentBackUrl ?? null,
    ktpSelfieFrontUrl: data.ktpSelfieFrontUrl ?? null,
    ktpSelfieBackUrl: data.ktpSelfieBackUrl ?? null,
    livenessSelfieUrl: data.livenessSelfieUrl ?? null,
    livenessStep1Url: data.livenessStep1Url ?? null,
    livenessStep2Url: data.livenessStep2Url ?? null,
    livenessStep3Url: data.livenessStep3Url ?? null,
    addressProofUrl: data.addressProofUrl ?? null,
    addressVerification: data.addressVerification ?? null,
    submittedAt: serverTimestamp(),
  }));

  await updateDoc(doc(db, "users", uid), sanitizeForFirestore({
    kycStatus: "pending",
    kycTier: 1,
    kycRejectionReason: null,
    kycResubmitRequired: false,
    kycFaceVerified: data.faceVerified,
    kycLivenessPassed: data.livenessPassed,
    kycLivenessScore: data.livenessScore ?? 0,
    kycFaceMatchScore: data.faceMatchScore ?? 0,
    kycOcrMatchScore: data.ocrMatchScore ?? 0,
    kycRiskScore: data.riskScore ?? 0,
    updatedAt: serverTimestamp(),
  }));
}

export async function patchKycApplication(
  uid: string,
  patch: Partial<Pick<KycApplication,
    | "idDocumentUrl"
    | "idDocumentFrontUrl"
    | "idDocumentBackUrl"
    | "addressProofUrl"
    | "hasIdDocument"
    | "hasAddressProof"
    | "ktpSelfieFrontUrl"
    | "ktpSelfieBackUrl"
    | "hasKtpSelfie"
  >>,
): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  await setDoc(doc(db, "kyc_applications", uid), sanitizeForFirestore({
    ...patch,
    updatedAt: serverTimestamp(),
  }), { merge: true });
}

/** Sync KYCPORT verification status into admin kyc_applications panel. */
export async function syncKycPortApplication(
  uid: string,
  data: {
    fullName?: string;
    email?: string;
    phone?: string;
    status: string;
    tier: number;
    verifiedAt?: string | null;
    partnerId?: string;
    appName?: string;
  },
): Promise<void> {
  const statusNorm = ((): KycStatus | string => {
    const s = data.status.toLowerCase();
    if (s === "verified" || s === "approved") return "verified";
    if (s === "rejected") return "rejected";
    return "pending";
  })();

  const verified = statusNorm === "verified";
  const payload = sanitizeForFirestore({
    uid,
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    status: statusNorm,
    tier: data.tier,
    provider: "GARUDA_PRIME",
    partnerId: data.partnerId ?? "garudaprime",
    appName: data.appName ?? "Garuda Prime",
    faceVerified: verified,
    livenessPassed: verified,
    hasIdDocument: verified,
    hasAddressProof: false,
    reviewedAt: verified ? (data.verifiedAt ?? new Date().toISOString()) : null,
    updatedAt: serverTimestamp(),
  });

  if (!isFirebaseConfigured || !db) {
    demoApplications[uid] = {
      ...(demoApplications[uid] ?? {
        uid,
        status: "pending",
        tier: 1,
        provider: "KYCPORT",
        faceVerified: false,
        livenessPassed: false,
        hasIdDocument: false,
        hasAddressProof: false,
      }),
      ...payload,
      uid,
    } as KycApplication;
    return;
  }

  await setDoc(doc(db, "kyc_applications", uid), payload, { merge: true });
}

export async function getKycApplication(uid: string): Promise<KycApplication | null> {
  if (!isFirebaseConfigured || !db) return demoApplications[uid] ?? null;
  const snap = await getDoc(doc(db, "kyc_applications", uid));
  if (!snap.exists()) return null;
  return { uid, ...(snap.data() as Omit<KycApplication, "uid">) };
}

export function computeKycRiskScore(input: {
  faceVerified: boolean;
  hasIdDocument: boolean;
  hasGeoLocation?: boolean;
  hasAddressProof?: boolean;
  domicileComplete: boolean;
  addressStrengthScore?: number;
}): number {
  let score = 0;
  if (!input.faceVerified) score += 25;
  if (!input.hasIdDocument) score += 30;
  if (!input.hasGeoLocation && !input.hasAddressProof) score += 20;
  if (!input.domicileComplete) score += 15;
  if (input.addressStrengthScore !== undefined) {
    const addressRisk = Math.round((100 - input.addressStrengthScore) * 0.2);
    score += addressRisk;
  }
  return Math.min(100, score);
}
