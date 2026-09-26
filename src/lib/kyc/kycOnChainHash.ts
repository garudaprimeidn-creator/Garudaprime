import type { KycAddress } from "../merchant/kycAddress";
import type { AddressVerificationResult } from "./addressVerification";

/** Canonical KYC payload for on-chain anchor, no photo URLs or PII images. */
export type KycHashPayload = {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  documentType: string;
  country: string;
  domicile: KycAddress;
  faceVerified: boolean;
  livenessPassed: boolean;
  faceMatchScore: number;
  ocrMatchScore: number;
  riskScore: number;
  addressVerification?: AddressVerificationResult | null;
  submittedAt: string;
};

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return `fallback_${Math.abs(hash).toString(16)}_${input.length}`;
}

/** Deterministic verification hash, photos remain off-chain. */
export async function computeKycVerificationHash(payload: KycHashPayload): Promise<string> {
  const canonical = JSON.stringify({
    uid: payload.uid.trim(),
    fullName: payload.fullName.trim().toLowerCase(),
    email: payload.email.trim().toLowerCase(),
    phone: payload.phone.replace(/\D/g, ""),
    documentType: payload.documentType.trim().toUpperCase(),
    country: payload.country.trim().toUpperCase(),
    domicile: {
      addressLine1: payload.domicile.addressLine1.trim(),
      city: payload.domicile.city.trim(),
      province: payload.domicile.province.trim(),
      postalCode: payload.domicile.postalCode.trim(),
      country: payload.domicile.country.trim().toUpperCase(),
    },
    faceVerified: payload.faceVerified,
    livenessPassed: payload.livenessPassed,
    faceMatchScore: Math.round(payload.faceMatchScore),
    ocrMatchScore: Math.round(payload.ocrMatchScore),
    riskScore: Math.round(payload.riskScore),
    submittedAt: payload.submittedAt,
  });
  return sha256Hex(canonical);
}
