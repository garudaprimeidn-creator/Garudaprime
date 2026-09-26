import type { KycAddress } from "../merchant/kycAddress";
import {
  isKnownProvince,
  isValidPostalCodeFormat,
  normalizeProvinceName,
  postalCodeMatchesProvince,
} from "./indonesiaRegions";

export type KycDocType = "passport" | "national_id" | "drivers_license" | "other";

/** 5-step KYC wizard: personal → ID → selfie/liveness → OCR/face → review/submit */
export const KYC_FLOW_REVIEW_STEP = 4;
export const KYC_FLOW_MAX_STEP = 4;

export type KycPersonalSnapshot = {
  fullName: string;
  email: string;
  phone: string;
};

export type KycCaptureRequirements = {
  idFront: true;
  idBack: boolean;
  selfieFront: true;
  selfieBack: boolean;
  gpsRequired: boolean;
  ocrEnabled: boolean;
};

export type KycFlowSnapshot = {
  idDocumentFront: string | null;
  idDocumentBack: string | null;
  ktpSelfieFront: string | null;
  ktpSelfieBack: string | null;
  faceVerified: boolean;
};

export const KYC_DOC_TYPES: KycDocType[] = ["passport", "national_id", "drivers_license", "other"];

/** Document types shown per country, order reflects local preference. */
export function getAvailableDocTypes(country: string): KycDocType[] {
  const code = country.toUpperCase();
  if (code === "ID") return ["national_id", "passport", "drivers_license", "other"];
  if (code === "US" || code === "CA" || code === "AU" || code === "GB") {
    return ["passport", "drivers_license", "national_id", "other"];
  }
  if (code === "MY" || code === "SG" || code === "BN") {
    return ["national_id", "passport", "drivers_license", "other"];
  }
  return ["passport", "national_id", "drivers_license", "other"];
}

export function getDefaultDocType(country: string): KycDocType {
  return country === "ID" ? "national_id" : "passport";
}

export function getCaptureRequirements(country: string, docType: KycDocType): KycCaptureRequirements {
  if (docType === "other") {
    return {
      idFront: true,
      idBack: true,
      selfieFront: true,
      selfieBack: false,
      gpsRequired: country === "ID",
      ocrEnabled: false,
    };
  }
  if (docType === "passport") {
    return {
      idFront: true,
      idBack: false,
      selfieFront: true,
      selfieBack: false,
      gpsRequired: false,
      ocrEnabled: false,
    };
  }
  if (docType === "drivers_license") {
    return {
      idFront: true,
      idBack: true,
      selfieFront: true,
      selfieBack: false,
      gpsRequired: country === "ID",
      ocrEnabled: false,
    };
  }
  if (country === "ID") {
    return {
      idFront: true,
      idBack: true,
      selfieFront: true,
      selfieBack: true,
      gpsRequired: true,
      ocrEnabled: true,
    };
  }
  return {
    idFront: true,
    idBack: true,
    selfieFront: true,
    selfieBack: false,
    gpsRequired: false,
    ocrEnabled: false,
  };
}

export function getPostalPattern(country: string): RegExp {
  switch (country.toUpperCase()) {
    case "ID":
      return /^\d{5}$/;
    case "US":
      return /^\d{5}(-\d{4})?$/;
    case "GB":
      return /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;
    case "CA":
      return /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i;
    case "AU":
    case "NZ":
      return /^\d{4}$/;
    case "SG":
      return /^\d{6}$/;
    case "MY":
      return /^\d{5}$/;
    default:
      return /^[\w\s-]{2,16}$/i;
  }
}

export function isPostalValid(country: string, postal: string): boolean {
  const value = postal.trim();
  if (!value) return false;
  return getPostalPattern(country || "US").test(value);
}

export function isRegionValid(country: string, region: string): boolean {
  const value = region.trim();
  if (!value) return false;
  if (country === "ID") return isKnownProvince(value);
  return value.length >= 2;
}

export function isPostalRegionMatch(country: string, postal: string, region: string): boolean {
  if (country !== "ID") return isPostalValid(country, postal) && isRegionValid(country, region);
  return isValidPostalCodeFormat(postal)
    && isKnownProvince(region)
    && postalCodeMatchesProvince(postal, region);
}

export function isDomicileAddressValid(domicile: KycAddress): boolean {
  const country = domicile.country?.trim() || "";
  return Boolean(
    country
    && domicile.addressLine1.trim()
    && domicile.city.trim()
    && domicile.province.trim()
    && isPostalValid(country, domicile.postalCode)
    && isRegionValid(country, domicile.province),
  );
}

export function areIdDocumentsComplete(
  front: string | null,
  back: string | null,
  req: KycCaptureRequirements,
): boolean {
  if (!front) return false;
  if (req.idBack && !back) return false;
  return true;
}

export function isFaceVerificationComplete(
  data: KycFlowSnapshot,
  req: KycCaptureRequirements,
): boolean {
  if (req.selfieBack) return Boolean(data.ktpSelfieFront && data.ktpSelfieBack);
  return Boolean(data.ktpSelfieFront);
}

export function resolveSubmitDocumentType(
  country: string,
  docType: KycDocType,
  otherLabel?: string,
): string {
  if (docType === "other") {
    const label = otherLabel?.trim();
    return label ? `OTHER:${label.slice(0, 64)}` : "OTHER";
  }
  if (docType === "passport") return "PASSPORT";
  if (docType === "drivers_license") return "DRIVERS_LICENSE";
  if (country === "ID" && docType === "national_id") return "KTP";
  return "NATIONAL_ID";
}

export function regionFieldLabel(country: string, lang: "en" | "id"): string {
  if (country === "ID") return lang === "id" ? "Provinsi" : "Province";
  if (country === "US" || country === "CA" || country === "AU") return lang === "id" ? "Negara Bagian" : "State";
  if (country === "GB") return lang === "id" ? "County / Region" : "County / Region";
  return lang === "id" ? "Provinsi / Region" : "State / Province / Region";
}

export function normalizeRegionForCompare(country: string, region: string): string {
  if (country === "ID") return normalizeProvinceName(region);
  return region.trim().toUpperCase();
}

export function isPersonalDataStepComplete(
  personal: KycPersonalSnapshot,
  domicile: KycAddress,
  docType: KycDocType,
  docTypeOther: string,
  geoRequired: boolean,
  geo: { lat: number; lng: number } | null,
): boolean {
  const nameOk = personal.fullName.trim().length >= 2;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal.email.trim());
  const phoneOk = personal.phone.replace(/\D/g, "").length >= 8;
  const otherOk = docType !== "other" || docTypeOther.trim().length >= 2;
  const domicileOk = isDomicileAddressValid(domicile);
  const geoOk = !geoRequired || Boolean(geo);
  return nameOk && emailOk && phoneOk && otherOk && domicileOk && geoOk;
}

export type KycSelfieStepSnapshot = {
  ktpSelfieFront: string | null;
  ktpSelfieBack: string | null;
  faceCapture: string | null;
  livenessPassed: boolean;
};

export function isSelfieStepComplete(
  data: KycSelfieStepSnapshot,
  req: KycCaptureRequirements,
): boolean {
  if (!data.ktpSelfieFront?.startsWith("data:")) return false;
  if (req.selfieBack && !data.ktpSelfieBack?.startsWith("data:")) return false;
  return Boolean(data.faceCapture?.startsWith("data:") && data.livenessPassed);
}

/** @deprecated Use isSelfieStepComplete, kept for call-site clarity in liveness-only checks */
export function isLivenessStepComplete(
  faceCapture: string | null,
  livenessPassed: boolean,
): boolean {
  return Boolean(faceCapture?.startsWith("data:") && livenessPassed);
}
